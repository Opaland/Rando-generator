import { test } from '@playwright/test'

/**
 * Issue #446 — le premier affichage utile, mesuré plutôt que supposé.
 *
 * Tout le reste du dépôt est mesuré : score de mutation, couverture, ΔE de
 * contraste, pas du MNT, poids d'un découpage communal. Le seul chiffre qui
 * décide si quelqu'un voit l'application ou referme l'onglet ne l'était pas.
 * L'issue ne demande pas d'optimiser (§2 : « c'est trop lourd » sans chiffre
 * est une opinion déguisée en fait) — elle demande de mesurer trois choses
 * avant toute décision, et ce fichier les mesure toutes les trois :
 *
 * 1. le temps jusqu'au premier affichage utile, sur un réseau contraint ;
 * 2. si le poids de `MapView` (chargé en différé, `lazy()` dans `App.tsx`)
 *    pèse sur ce premier affichage, ou se télécharge en parallèle sans le
 *    retarder — lu dans `dist/index.html` : seuls `index-*.js` (387 Ko) et
 *    `index-*.css` (62 Ko) y sont chargés en tête, sans balise de
 *    préchargement pour `MapView-*.js` ;
 * 3. ce que le service worker change au second chargement.
 *
 * **Ce fichier mesure, il ne juge pas** — aucune assertion de durée. Un
 * seuil posé sans avoir vu la distribution des temps sur plusieurs machines
 * serait le nombre inventé que le §2 interdit, et un seuil posé sur la
 * machine d'intégration mesurerait la machine plutôt que le code (§6, la
 * leçon des trois chronomètres de #491). C'est à une lecture humaine de
 * décider si les chiffres justifient #93 (tuiles vectorielles) en P1 ou la
 * laissent en P3.
 *
 * ## Sur le profil réseau
 *
 * `PROFIL_RESEAU` est un profil de test choisi pour ce fichier, **pas** une
 * reproduction certifiée d'un préréglage « Slow 3G » de Chrome DevTools ou
 * de Lighthouse — ces chiffres précis n'ont pas pu être vérifiés depuis cet
 * environnement. Prétendre le contraire serait le faux confort que le §2
 * interdit. Ce qui est vrai : un débit et une latence fixes, les mêmes à
 * chaque exécution, donc comparables d'une fois sur l'autre.
 *
 * Hors de la porte, comme `mesure-bibliotheque.spec.ts` : `npm run
 * chargement`.
 */

const PROFIL_RESEAU = {
  offline: false,
  latency: 400, // ms
  downloadThroughput: (300 * 1024) / 8, // 300 Kb/s en octets/s
  uploadThroughput: (300 * 1024) / 8,
}

/** Un multiplicateur simple, tel que défini par le protocole CDP. */
const RALENTISSEMENT_CPU = 4

function relever(nom: string, valeur: string): void {
  process.stdout.write(`\nMESURE ${nom} = ${valeur}\n`)
}

test.describe('premier affichage utile (issue #446)', () => {
  test.skip(
    process.env['CHARGEMENT'] !== '1',
    'Mesure sous throttling, hors de la porte : `npm run chargement`.',
  )
  test.use({ serviceWorkers: 'allow' })
  test.setTimeout(5 * 60 * 1000)

  async function visiter(
    context: Awaited<ReturnType<import('@playwright/test').Browser['newContext']>>,
    baseURL: string,
  ) {
    const page = await context.newPage()
    const client = await context.newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', PROFIL_RESEAU)
    await client.send('Emulation.setCPUThrottlingRate', { rate: RALENTISSEMENT_CPU })

    const requetes: { url: string; finMs: number }[] = []
    const debut = Date.now()
    page.on('requestfinished', (requete) => {
      requetes.push({
        url: requete.url().replace(baseURL, ''),
        finMs: Date.now() - debut,
      })
    })

    await page.goto(baseURL, { waitUntil: 'commit' })
    await page.waitForSelector('[data-testid="zone-section"]', { timeout: 60_000 })
    const finChromeMs = Date.now() - debut

    // Le panneau de zone peut être visible avant que le chunk MapView, en
    // téléchargement parallèle, n'ait fini d'arriver — c'est précisément ce
    // que #446 demande de distinguer. On attend donc aussi son arrivée
    // (avec un plafond) plutôt que de fermer la page sur une réponse encore
    // en vol, qui rendrait « non observé » alors qu'elle finirait une
    // seconde plus tard.
    await page
      .waitForResponse((reponse) => /\/?assets\/MapView-.*\.js$/.test(reponse.url()), {
        timeout: 60_000,
      })
      .catch(() => null)

    const peintures = await page.evaluate(() =>
      performance
        .getEntriesByType('paint')
        .map((entree) => ({ nom: entree.name, tempsMs: Math.round(entree.startTime) })),
    )
    const mapView = requetes.find((r) => /^\/?assets\/MapView-.*\.js$/.test(r.url))

    await page.close()
    return {
      finChromeMs,
      peintures,
      mapViewFinMs: mapView?.finMs ?? null,
      nbRequetes: requetes.length,
    }
  }

  test('cache froid, puis second chargement sous service worker', async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error('baseURL manquant')

    const context = await browser.newContext()
    try {
      const froid = await visiter(context, baseURL)

      relever('reseau_debit_kbps', String((PROFIL_RESEAU.downloadThroughput * 8) / 1024))
      relever('reseau_latence_ms', String(PROFIL_RESEAU.latency))
      relever('cpu_ralentissement', String(RALENTISSEMENT_CPU))
      relever('froid_panneau_zone_ms', String(froid.finChromeMs))
      for (const p of froid.peintures) {
        relever(`froid_${p.nom.replace(/-/g, '_')}_ms`, String(p.tempsMs))
      }
      relever(
        'froid_mapview_fin_ms',
        froid.mapViewFinMs === null ? 'non_observe' : String(froid.mapViewFinMs),
      )
      relever('froid_nb_requetes', String(froid.nbRequetes))

      // Laisser le service worker s'installer avant la seconde visite —
      // sinon elle le rate aussi et ne mesure rien de nouveau.
      const page = await context.newPage()
      await page.goto(baseURL)
      await page.waitForFunction(() => navigator.serviceWorker.controller != null, {
        timeout: 30_000,
      })
      await page.close()

      const chaud = await visiter(context, baseURL)
      relever('chaud_panneau_zone_ms', String(chaud.finChromeMs))
      for (const p of chaud.peintures) {
        relever(`chaud_${p.nom.replace(/-/g, '_')}_ms`, String(p.tempsMs))
      }
      relever(
        'chaud_mapview_fin_ms',
        chaud.mapViewFinMs === null ? 'non_observe' : String(chaud.mapViewFinMs),
      )
      relever('chaud_nb_requetes', String(chaud.nbRequetes))

      process.stdout.write(
        '\nÀ lire : si « panneau_zone_ms » arrive nettement avant « mapview_fin_ms »,\n' +
          'le poids de la carte ne bloque pas le premier affichage utile — il se\n' +
          'télécharge en parallèle, différé dans le rendu mais pas dans le\n' +
          'déclenchement du téléchargement. Le second chargement (« chaud_* ») dit ce\n' +
          'que le service worker change réellement : une chute du nombre de requêtes\n' +
          'y est attendue, pas forcément du temps si le CPU simulé reste le goulot.\n',
      )
    } finally {
      await context.close()
    }
  })
})
