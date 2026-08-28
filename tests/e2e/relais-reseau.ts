import type { Page, Route } from '@playwright/test'
import type { TentativeReseau } from '../fixtures/verdictReseau'

/**
 * Faire sortir les requêtes de l'application pour de vrai, sans mock.
 *
 * ## Pourquoi un relais, et pas simplement « ne rien intercepter »
 *
 * Mesuré le 27/08 dans ce conteneur : le réseau sortant passe par un proxy
 * local, et **Chromium n'arrive pas à le traverser** — `net::ERR_CONNECTION_
 * RESET` sur `https://example.com/`, avec `--proxy-server` comme sans. Le
 * même hôte répond 200 depuis `curl`, et 200 depuis le contexte de requêtes
 * de Playwright, qui vit côté Node.
 *
 * Ce relais tire donc les vraies réponses côté Node (`route.fetch`) et les
 * rend au navigateur telles quelles (`route.fulfill`). Ce n'est pas un
 * mock : aucun octet n'est inventé, chaque requête part vers le serveur
 * qu'elle visait, et c'est sa réponse d'aujourd'hui qui arrive dans la page.
 *
 * ## Ce que le relais change quand même, et qu'il faut savoir
 *
 * - la requête part de Node, pas de la pile réseau de Chromium : le cache
 *   HTTP du navigateur, HTTP/3 et la résolution DNS de Chromium ne sont pas
 *   exercés ;
 * - les en-têtes de la vraie réponse sont rendus tels quels, CORS compris —
 *   une politique CORS cassée chez un tiers se verrait donc encore ;
 * - le service worker est bloqué par `playwright.config.ts` pour toute la
 *   suite ; ces tests ne disent donc rien du cache hors ligne, qui a ses
 *   propres tests.
 *
 * Le dire ici plutôt que de laisser croire à un « vrai navigateur sur le
 * vrai réseau » : la nuance est exactement ce que CLAUDE.md §4bis demande
 * de ne pas laisser vieillir en silence.
 */

/**
 * Une remise à zéro de connexion n'est pas une réponse du serveur : c'est le
 * transport qui a lâché avant que quoi que ce soit soit dit. Mesuré le
 * 27/08 sur `overpass-api.de` : trois `curl` identiques d'affilée, trois
 * « connection reset by peer » à sept secondes, puis un 200 en 1,5 s deux
 * minutes plus tard. Le miroir régule, et il a raison de le faire.
 *
 * Réessayer une fois est donc ce que fait n'importe quel client réel — pas
 * un pansement sur un défaut de l'application, qui n'a rien vu de tout ça.
 * Ce qui échoue encore au second essai est enregistré tel quel, et c'est au
 * test appelant de décider s'il peut encore conclure quoi que ce soit.
 */
const REESSAIS_TRANSPORT = 1
const REPOS_ENTRE_ESSAIS_MS = 3_000

const patienter = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms))

/**
 * Ce qui est servi par cette machine — et donc, ici, par le `dist/` du dépôt.
 *
 * Deux questions différentes s'appuient sur cette seule réponse, et c'est
 * voulu (§4ter) :
 *
 * - le relais n'a rien à relayer d'une adresse que le navigateur atteint
 *   déjà. La règle est « la boucle locale » et non « l'origine de
 *   l'application » : servie depuis GitHub Pages, l'application est
 *   elle-même hors d'atteinte de Chromium dans ce conteneur, et ses propres
 *   fichiers doivent passer par le relais comme le reste ;
 * - `playwright.config.ts` n'a de `dist/` à comparer aux sources que si la
 *   cible est justement servie d'ici.
 *
 * Écrire cette règle deux fois donnerait deux listes disant la même chose,
 * dans deux fichiers qui ne changent jamais ensemble.
 */
export function estSurCetteMachine(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
}

/** La même question, posée sur une adresse qui peut être illisible. */
export function cibleServieDIci(adresse: string | undefined): boolean {
  if (adresse === undefined || adresse === '') return true
  try {
    return estSurCetteMachine(new URL(adresse))
  } catch {
    /*
      Une adresse qu'on n'arrive pas à lire est traitée comme locale : le
      contrôle de fraîcheur reste posé. Se tromper dans ce sens coûte un
      `npm run build` de trop ; se tromper dans l'autre laisse tester une
      version périmée, ce qui est le raté que tout ce dispositif existe pour
      empêcher.
    */
    return true
  }
}

export interface Relais {
  /**
   * Chaque requête partie vers un tiers, et ce qu'elle est devenue.
   *
   * Compter les hôtes joints ne suffisait pas : un miroir qui rend 429 est
   * « joint » et n'a rien donné. Le 27/08, c'est ce qui a fait rougir un
   * test là où le fait mesuré était « Overpass régule ».
   */
  tentatives: () => TentativeReseau[]
}

export async function relayerLeVraiReseau(page: Page): Promise<Relais> {
  const tentatives: TentativeReseau[] = []

  const relayer = async (route: Route): Promise<void> => {
    const url = new URL(route.request().url())
    if (estSurCetteMachine(url)) {
      await route.continue()
      return
    }
    let derniere = 'inconnue'
    for (let essai = 0; essai <= REESSAIS_TRANSPORT; essai += 1) {
      try {
        const reponse = await route.fetch({ timeout: 60_000 })
        tentatives.push({ hote: url.host, statut: reponse.status() })
        await route.fulfill({ response: reponse })
        return
      } catch (erreur) {
        derniere = (erreur as Error).message.split('\n')[0] ?? 'inconnue'
        if (essai < REESSAIS_TRANSPORT) await patienter(REPOS_ENTRE_ESSAIS_MS)
      }
    }
    tentatives.push({ hote: url.host, raison: derniere })
    /*
      Abandonner plutôt que rendre un corps inventé : l'application doit voir
      un échec réseau, qui est ce qui vient de se produire. Lui fournir une
      réponse vide la ferait mentir sur ce qu'elle a reçu.
    */
    await route.abort()
  }

  await page.route('**/*', (route) => void relayer(route))
  return { tentatives: () => tentatives }
}
