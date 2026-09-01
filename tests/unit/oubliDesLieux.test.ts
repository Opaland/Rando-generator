import { describe, it, expect, vi } from 'vitest'
import { type Lieu } from '../../src/core/geocode.ts'
import { trancheZone, type DependancesZone } from '../../src/store/trancheZone.ts'
import { trancheRecherche } from '../../src/store/rechercheDeLieu.ts'

/**
 * Issue #454 — une réponse de géocodage en vol ne doit rouvrir aucune liste.
 *
 * ## Ce qui était faux, mesuré
 *
 * `lieuSequence` décide quelle réponse a le droit de s'afficher. La remise à
 * zéro de la recherche était écrite quatre fois dans `trancheZone.ts`, et
 * **seule `effacerLieux` faisait le geste entier** : incrémenter le compteur
 * et éteindre le témoin de chargement. Les deux autres — le champ vidé, le
 * lieu choisi — n'en faisaient que la moitié visible.
 *
 * Or c'est l'autre moitié qui compte : une réponse en vol ne se compare qu'au
 * compteur. La sonde a montré, sur les deux chemins, la liste des
 * suggestions qui se rouvre toute seule après le geste censé la fermer — et
 * sur le second, par-dessus la zone qu'on venait de choisir.
 *
 * C'est le §4 dans sa forme littérale, et le §4ter pour la conséquence : ces
 * quatre écritures ne changent jamais ensemble, et elles avaient déjà
 * divergé.
 *
 * ## Pourquoi les trois chemins dans le même fichier
 *
 * `oublierLesLieux` supprime la divergence, mais rien n'empêche qu'un des
 * trois appels soit un jour remplacé par une remise à zéro écrite à la main
 * « juste pour ce cas » — c'est précisément ce qui s'était produit. Les
 * questions sont donc posées sur les trois à la fois, de sorte que le
 * message d'échec nomme le chemin fautif.
 */

/**
 * Overpass n'a rien à faire ici, et le laisser joignable a coûté une CI.
 *
 * `loadAutour` enchaîne sur un chargement de zone. Sans ce bouchon, ce
 * chargement part vraiment sur le réseau : localement `fetch` échoue en
 * quelques millisecondes et les tests passaient ; sur le runner, il résout
 * et attend, et les deux questions posées sur ce geste dépassaient les cinq
 * secondes. Le test mesurait donc, sans le dire, ce que le réseau de la
 * machine veut bien faire (§6ter : une mesure unique d'un état qui met un
 * temps non nul à s'établir).
 *
 * Un rejet immédiat rend l'échec de la zone déterministe. Ce qui est mesuré
 * ici reste ce qu'il advient des quatre champs de la recherche, et l'échec
 * de la zone n'y touche pas.
 *
 * `oubliDuCacheDeZone.test.ts` porte la même précaution, et son commentaire
 * la disait déjà : « sans cela, chaque test de garde partirait pour une
 * vraie requête réseau ». Je l'avais lu une heure plus tôt. Deux fichiers
 * qui ont besoin de la même neutralisation et ne l'ont écrite qu'une fois,
 * c'est le §4ter vu depuis les tests — noté en #456.
 */
vi.stubGlobal('fetch', () =>
  Promise.reject(new Error('aucun réseau dans ce test')),
)

/** Ce que le service de géocodage rendra, décidé test par test. */
let repondre: (query: string) => Promise<Lieu[]>

vi.mock('../../src/core/geocode.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/geocode.ts')>(
      '../../src/core/geocode.ts',
    )
  return { ...vrai, chercherLieux: (query: string) => repondre(query) }
})

const commune = (label: string): Lieu => ({
  label,
  contexte: '69, Rhône',
  center: [4.83, 45.76],
})

/** Le strict nécessaire pour appeler la tranche, et rien de plus. */
function tranche() {
  const etat = {
    lieux: [] as Lieu[],
    lieuError: null as string | null,
    lieuxVides: false,
    lieuxLoading: false,
  }
  const poser = (partiel: unknown) => {
    const bout =
      typeof partiel === 'function'
        ? (partiel as (e: unknown) => object)(etat)
        : partiel
    Object.assign(etat, bout)
  }
  const deps = {
    set: poser,
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: () => Promise.resolve(),
    oublierLaZoneEnCache: () => Promise.resolve(),
    recompute: () => Promise.resolve(),
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone
  /*
    Les deux tranches ensemble sous un seul nom : la recherche a quitté la
    zone (#454), mais `loadAutour` la referme toujours — et c'est justement
    cet accord que ces tests éprouvent.
  */
  const recherche = trancheRecherche({ set: poser })
  const actions = {
    ...trancheZone({ ...deps, oublierLesLieux: recherche.effacerLieux }),
    ...recherche,
  }
  return { actions, etat }
}

/**
 * Les trois gestes qui ferment la recherche.
 *
 * `loadAutour` part chercher une zone chez Overpass, que le bouchon de
 * `fetch` ci-dessus fait échouer tout de suite. `zoneError` se remplit, et
 * **ce n'est pas ce qu'on mesure ici**.
 */
type Actions = ReturnType<typeof tranche>['actions']

const gestes = [
  {
    quoi: 'le champ vidé',
    fermer: (actions: Actions) =>
      actions.chercherLieu(''),
  },
  {
    quoi: 'un lieu choisi',
    fermer: (actions: Actions) =>
      actions.loadAutour(commune('Lyon')),
  },
  {
    quoi: 'la fermeture explicite',
    fermer: (actions: Actions) => {
      actions.effacerLieux()
      return Promise.resolve()
    },
  },
]

describe.each(gestes)('après $quoi', ({ fermer }) => {
  it('une réponse encore en vol ne rouvre pas la liste', async () => {
    let tenir: (lieux: Lieu[]) => void = () => undefined
    repondre = () => new Promise<Lieu[]>((resolve) => (tenir = resolve))

    const { actions, etat } = tranche()
    const enVol = actions.chercherLieu('Lyon')
    await fermer(actions)
    // Sans ce préalable, un service qui n'aurait jamais été appelé rendrait
    // la même liste vide à la fin.
    expect(etat.lieux).toEqual([])

    tenir([commune('Lyon')])
    await enVol

    expect(etat.lieux).toEqual([])
  })

  it('éteint le témoin de chargement', async () => {
    repondre = () => new Promise<Lieu[]>(() => undefined)

    const { actions, etat } = tranche()
    const enVol = actions.chercherLieu('Lyon')
    void enVol
    expect(etat.lieuxLoading).toBe(true)

    await fermer(actions)

    expect(etat.lieuxLoading).toBe(false)
  })
})
