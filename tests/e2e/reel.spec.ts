import { test, expect, type Page } from '@playwright/test'
import { relayerLeVraiReseau, type Relais } from './relais-reseau'
import { raisonDeNePasConclure } from '../fixtures/verdictReseau'

/**
 * Une borne contre l'infini, pas un budget.
 *
 * Mesuré le 27/08 : le premier miroir coupe la connexion à sept secondes, le
 * second reste muet, et l'application affiche « nouvelle tentative sur un
 * second serveur… (119 s) » — pendant que le test, borné à deux minutes, la
 * déclarait cassée. Elle faisait exactement ce qu'on lui demande.
 *
 * Ce n'est donc **pas** ce nombre qui décide quand arrêter d'attendre :
 * c'est l'application, quand elle cesse de dire qu'elle travaille. Voir
 * `attendreLaZone`. Sept minutes ne protègent pas de la lenteur — elles
 * protègent d'une attente sans fin, comme le `globalTimeout` de
 * `playwright.config.ts`.
 */
const BORNE_D_ATTENTE_MS = 7 * 60 * 1000

/**
 * L'application contre les **vrais** services, sans un seul mock.
 *
 * ## Pourquoi c'est un fichier à part, et sauté par défaut
 *
 * Les 379 tests de la suite ordinaire tournent sur des fixtures. C'est ce
 * qui les rend utilisables dans une porte : ils mesurent le code, et rien
 * d'autre. Le prix est qu'ils ne disent **rien** de ce que rendent Overpass,
 * l'IGN ou la Base Adresse Nationale aujourd'hui — ni de ce que
 * l'application fait de leurs réponses réelles, qui ne ressemblent jamais
 * tout à fait aux fixtures.
 *
 * Ces tests-là comblent ce trou, et ne peuvent pas rejoindre la porte :
 *
 * - ils dépendent de serveurs publics qui tombent, limitent et changent ;
 * - un rouge n'y voudrait pas dire « le code est cassé » mais « Overpass est
 *   surchargé », et une porte qui rougit sur la panne d'un tiers cesse
 *   d'être lue — c'est exactement le défaut corrigé dans #346 ;
 * - la donnée OSM bouge : aucun compte exact ne s'y asserte.
 *
 * D'où `REEL=1`, le même motif que `mesuresReseau.test.ts`. Sans la
 * variable, tout ce fichier est sauté, et il apparaît comme tel dans chaque
 * suite — une façon de ne pas l'oublier.
 *
 * ## Ce qu'ils assertent, et ce qu'ils n'assertent pas
 *
 * Jamais un nombre exact : « au moins un itinéraire », pas « trois ». La
 * donnée OpenStreetMap change tous les jours, et un test qui compte
 * deviendrait faux sans que rien ne soit cassé.
 *
 * Et **chaque test vérifie d'abord que le réseau a répondu**. Sans cette
 * distinction, un miroir muet rendrait une page vide et le test conclurait
 * « pas d'itinéraire » au lieu de « pas de réponse » : un test qui peut
 * rougir pour une raison qu'on n'a pas voulue n'est pas un test
 * (CLAUDE.md §1bis). Quand rien n'a répondu, le test se saute **en disant
 * l'hôte et la raison** — on ne conclut pas d'une absence de mesure.
 */

const ACTIF = process.env['REEL'] === '1'
const PROXY = process.env['HTTPS_PROXY']

/**
 * Ce qu'on ouvre : la prévisualisation locale, ou **la page déployée** quand
 * `SENTIERS_URL` la désigne.
 *
 * Les deux valent la peine et ne disent pas la même chose. En local, on
 * mesure le code qu'on vient d'écrire contre les vrais serveurs ; sur la page
 * publiée, on mesure ce que les gens ouvrent vraiment — l'artefact, son
 * chemin de base, son cache — contre ces mêmes serveurs. Le second est le
 * seul des deux qui puisse contredire le premier.
 */
const CIBLE = process.env['SENTIERS_URL'] ?? '/'

/*
  Le proxy sortant du conteneur, quand il y en a un. Il n'est pas lu par
  Chromium — voir l'en-tête de `relais-reseau.ts` — mais par le contexte de
  requêtes de Playwright, qui est ce qui émet réellement les requêtes ici.
  `bypass` garde le serveur de prévisualisation en direct.
*/
if (PROXY) {
  test.use({ proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' } })
}

/**
 * Attendre que la zone ait abouti — chargée **ou** en erreur — puis dire
 * s'il reste quelque chose à mesurer.
 *
 * Attendre `zone-meta` seul ferait patienter jusqu'à la borne pour finir sur
 * « élément introuvable », c'est-à-dire sur le message le moins informatif
 * des trois. L'erreur de l'application est une réponse ; c'est son absence
 * qui n'en est pas une.
 */
async function attendreLaZone(page: Page, relais: Relais): Promise<void> {
  /*
    Boucler sur l'état final plutôt que photographier un instant : c'est le
    §6ter de CLAUDE.md, et ici la sortie de boucle appartient à
    l'application. Tant qu'elle n'a rien conclu, elle travaille — la
    déclarer cassée à un instant choisi par le test mesurerait autre chose
    que ce qu'on croit.
  */
  await expect
    .poll(
      async () => {
        if (await page.getByTestId('zone-meta').isVisible()) return 'chargée'
        if (await page.getByTestId('zone-error').isVisible()) return 'erreur'
        return 'en cours'
      },
      { timeout: BORNE_D_ATTENTE_MS, intervals: [500, 1_000, 2_000] },
    )
    .not.toBe('en cours')

  const raison = raisonDeNePasConclure(relais.tentatives())
  test.skip(raison !== '', raison)
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire')
}

test.describe('contre les vrais services', () => {
  test.skip(!ACTIF, 'REEL non défini : tests réseau réel sautés')

  // L'attente de la zone, plus de quoi charger la page, ouvrir une fiche et
  // aller chercher un profil altimétrique.
  test.setTimeout(BORNE_D_ATTENTE_MS + 120_000)

  test('une zone prédéfinie charge de vrais itinéraires', async ({ page }) => {
    const relais = await relayerLeVraiReseau(page)
    const echecsJs: string[] = []
    page.on('pageerror', (erreur) => {
      echecsJs.push(erreur.message)
    })
    await page.goto(CIBLE)
    await page.getByTestId('zone-pilat').click()

    /*
      « itinéraire » et non « 3 itinéraires » : le Pilat en comptait 56 au
      dernier relevé, et ce nombre n'appartient pas à ce dépôt.
    */
    await attendreLaZone(page, relais)
    await expect(page.getByTestId('itinerary-list')).toBeVisible()
    expect(echecsJs, `erreurs JavaScript : ${echecsJs.join(' | ')}`).toEqual([])
  })

  /**
   * La recherche « autour d'un lieu » sur Porcelette — issue #321.
   *
   * Cédric n'a vu aucun de ses trois PR le 25/08. Les mesures Overpass
   * disent qu'ils sont bien dans OSM (relations 11709008, 11980054,
   * 11989466, toutes `network=lwn`). Ce test demande à l'application
   * elle-même, sur le vrai réseau, ce qu'elle en fait.
   */
  test('Porcelette propose les sentiers du village (#321)', async ({
    page,
  }) => {
    const relais = await relayerLeVraiReseau(page)
    await page.goto(CIBLE)
    await page.getByTestId('lieu-input').fill('Porcelette')
    await page.getByTestId('lieu-submit').click()

    const propositions = page.getByTestId('lieu-results')
    await expect(propositions).toContainText('Porcelette', { timeout: 60_000 })
    await propositions.locator('li').first().getByRole('button').first().click()

    await attendreLaZone(page, relais)

    /*
      Les trois PR du village, nommés. Ce sont les seuls comptes de ce
      fichier, et ils sont là parce que l'issue les nomme : si l'un d'eux
      disparaissait d'OSM, ce test le dirait — ce qui est une information,
      pas un faux rouge.
    */
    const liste = page.getByTestId('itinerary-list')
    await expect(liste).toContainText('Circuit de la Hardt')
    await expect(liste).toContainText('Circuit du Kirchenberg')
  })

  test('une fiche affiche un profil venu de l’IGN', async ({ page }) => {
    const relais = await relayerLeVraiReseau(page)
    await page.goto(CIBLE)
    await page.getByTestId('zone-pilat').click()
    await attendreLaZone(page, relais)

    await page.getByTestId('itinerary-list').getByRole('button').first().click()
    await page.getByTestId('itinerary-card-detail-link').click()
    await expect(page.getByTestId('itinerary-detail')).toBeVisible({
      timeout: 60_000,
    })
    // Le profil vient de data.geopf.fr : soit il arrive, soit la fiche dit
    // pourquoi il manque. Les deux sont des réponses ; le silence, non.
    await expect(
      page
        .getByTestId('elevation-chart')
        .or(page.getByTestId('itinerary-detail').getByText(/altimétrique/i))
        .first(),
    ).toBeVisible({ timeout: 120_000 })

    const versIGN = relais
      .tentatives()
      .filter((tentative) => tentative.hote.includes('geopf'))
    expect(
      versIGN.filter((t) => t.statut !== undefined && t.statut < 400),
      `tentatives vers l'IGN : ${JSON.stringify(versIGN)}`,
    ).not.toEqual([])
  })
})
