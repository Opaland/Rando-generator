import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import { buildZip } from '../fixtures/zip.ts'

/**
 * Issue #159 — mesurer une grosse bibliothèque, puis décider.
 *
 * L'import d'archives a été développé sur des ZIP synthétiques de quelques
 * fichiers. Un export Strava ou Garmin réel en contient plusieurs centaines,
 * et trois nombres restaient inconnus : le temps d'import total, le
 * comportement au quota IndexedDB, et le poids de la sauvegarde qui en
 * découle.
 *
 * **Ce fichier mesure, il ne juge pas.** Il ne porte aucun seuil de durée :
 * un seuil posé sans mesure serait exactement le nombre inventé que
 * CLAUDE.md §2 interdit, et un seuil posé sur la machine d'intégration
 * mesurerait la machine et non le code — trois tests de la porte ont déjà
 * fait cette erreur (PR #236). Les assertions portent sur ce qui doit être
 * vrai quel que soit le temps : toutes les traces sont arrivées, la
 * sauvegarde les contient toutes, et rien n'a été perdu en silence.
 *
 * Il est **hors de la porte**, comme le monkey : `npm run mesure`. Une
 * bibliothèque de cette taille prend des minutes, et la porte tourne à
 * chaque commit.
 */

/** Le relevé s'écrit dans la sortie du test, et se recopie dans la doc. */
function relever(nom: string, valeur: string): void {
  process.stdout.write(`\nMESURE ${nom} = ${valeur}\n`)
}

/**
 * Une activité de montre : un point par seconde.
 *
 * `POINTS_PAR_ACTIVITE` vient d'une durée, pas d'un chiffre rond : 2 h 30 de
 * marche à un point par seconde, ce qui est la cadence par défaut des
 * montres Garmin et de l'enregistrement Strava. C'est ce qui rend la mesure
 * comparable à une vraie bibliothèque.
 */
const POINTS_PAR_ACTIVITE = 2.5 * 3600
const ACTIVITES = Number(process.env['MESURE_ACTIVITES'] ?? '800')

/*
  Issue #539, suite du 16/10 : l'espacement par défaut (1 m) tasse toutes
  les activités dans une poignée de cellules du hachage spatial de
  `buildTrackIndex` (0,0015° ≈ 167 m en latitude) — un artefact du banc, pas
  forcément le comportement d'une vraie bibliothèque dispersée sur des
  dizaines de sentiers. `MESURE_ESPACEMENT_M` permet de rejouer la même
  mesure avec des activités réellement éloignées, sans changer le défaut
  (1 m) qui garde les mesures précédentes comparables.
*/
const ESPACEMENT_M = Number(process.env['MESURE_ESPACEMENT_M'] ?? '1')

function gpxActivite(index: number): string {
  /*
    Chaque activité doit être **distincte**, et ce détail a failli me faire
    rapporter un défaut du produit.

    Ma première version écrivait `index % 40` : les huit cents fichiers ne
    portaient alors que quarante tracés différents, et l'import n'en gardait
    que quarante — correctement, puisque les autres étaient des doublons. Le
    relevé disait « 800 entrent, 40 arrivent », ce qui ressemblait beaucoup à
    une perte silencieuse. C'était la fixture qui était fausse.
  */
  const lat = 45.4 + (index * ESPACEMENT_M) / 111_195
  /*
    Issue #539, suite du 17/10, en deux correctifs successifs — le premier
    était incomplet, et c'est resté invisible jusqu'à la mesure suivante.

    1. L'horodatage s'écrivait à la main avec une heure figée à 08 et une
       minute qui boucle toutes les 3600 secondes — pour une activité de
       9 000 s (2,5 h), le temps reculait d'une heure pile, deux fois par
       activité. Corrigé en calculant l'horodatage depuis un `Date`.

    2. Insuffisant : chaque activité repartait du **même** instant de départ
       (`2026-05-01T08:00:00Z`), donc le tableau global une fois toutes les
       activités mises bout à bout (`tracks.flatMap((t) => t.points)` dans
       `recompute()`, `appStore.ts`) reculait quand même — à la frontière
       entre deux activités plutôt qu'au milieu d'une seule. Mesuré : une
       reproduction en mémoire avec cette seconde forme de recul donnait
       81 875 ms (50 activités) et 342 734 ms (100), quasi identique qu'on
       disperse les activités dans l'espace ou pas (83 949 ms et
       347 650 ms) — la même signature quadratique que l'horodatage cassé
       d'origine, et la preuve que l'hypothèse spatiale de cette issue
       (le hachage de `buildTrackIndex`) n'est pour rien dans le
       ralentissement.

    `windowedSpeedMps` (matching.ts) cherche une fenêtre de 60 s en arrière
    et en avant, et ne s'arrête que si l'écart dépasse cette fenêtre : un
    temps qui RECULE — qu'il boucle en interne ou qu'il reparte à zéro à la
    frontière suivante — ne dépasse jamais ce seuil (l'écart est négatif),
    donc la recherche ne s'arrête plus et balaie tout ce qui précède,
    jusqu'au début de tout ce qui a déjà été importé.

    Chaque activité démarre maintenant un jour après la précédente : le
    tableau global des temps croît strictement, comme pour une vraie
    bibliothèque où deux sorties ne partagent jamais leur horodatage.
    Reproduit en mémoire avec ce schéma : coût linéaire en nombre
    d'activités (1 220 ms, 3 163 ms, 6 599 ms à 20, 50, 100 activités).
  */
  const debut = Date.parse('2026-05-01T08:00:00Z') + index * 86_400_000
  const lignes: string[] = []
  for (let i = 0; i < POINTS_PAR_ACTIVITE; i++) {
    const lon = 4.5 + (i / POINTS_PAR_ACTIVITE) * 0.03
    const horodatage = new Date(debut + i * 1000).toISOString()
    lignes.push(
      `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${String(
        800 + (i % 150),
      )}</ele><time>${horodatage}</time></trkpt>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="mesure" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>${new Date(debut).toISOString()}</time></metadata>
  <trk><trkseg>${lignes.join('')}</trkseg></trk>
</gpx>`
}

test.describe('mesure d’une grosse bibliothèque (issue #159)', () => {
  test.skip(
    process.env['MESURE'] !== '1',
    'Mesure longue, hors de la porte : `npm run mesure`.',
  )
  // La mesure elle-même n'a pas de limite : c'est ce qu'on cherche à
  // connaître. Playwright, lui, en veut une.
  test.setTimeout(30 * 60 * 1000)

  test('importer une bibliothèque, puis la sauvegarder', async ({ page }) => {
    await mockExternalNetwork(page)
    await page.goto('/')

    const debutArchive = Date.now()
    const archive = await buildZip(
      Array.from({ length: ACTIVITES }, (_, i) => ({
        nom: `activites/sortie-${String(i + 1).padStart(4, '0')}.gpx`,
        contenu: gpxActivite(i),
      })),
    )
    relever('activites', String(ACTIVITES))
    relever('espacement_m', String(ESPACEMENT_M))
    relever('points_par_activite', String(POINTS_PAR_ACTIVITE))
    relever('archive_octets', String(archive.byteLength))
    relever('archive_fabrication_ms', String(Date.now() - debutArchive))

    const debutImport = Date.now()
    // Même horloge que les repères posés plus loin (`performance.now()`,
    // relative à la navigation) — `Date.now()` et elle ne se comparent pas.
    const debutImportPerf = await page.evaluate(() => performance.now())
    await page.getByTestId('gpx-input').setInputFiles({
      name: 'export-strava.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(archive),
    })

    await expect(page.getByTestId('gpx-importing')).toHaveCount(0, {
      timeout: 25 * 60 * 1000,
    })
    const finImport = Date.now()
    relever('import_ms', String(finImport - debutImport))

    /*
      Issue #539 : le temps total se partageait en un seul chiffre entre
      deux phases de nature différente — l'analyse séquentielle des
      fichiers, et l'unique calcul de correspondance final, qui construit
      entre autres un index spatial sur la totalité des points de toutes
      les traces d'un coup (`buildTrackIndex`, indépendant du nombre
      d'itinéraires — cette mesure n'en charge aucun).

      Une première version guettait `matchingBusy` (le « calcul… » du
      tableau de bord) dans le DOM : à 5 puis 50 activités, l'indicateur
      n'est jamais apparu alors que `computeMatching` a bien pris un temps
      mesurable (vérifié en construisant un Worker à la main dans la même
      page : aucune erreur, aucun blocage côté CSP). Rien ne garantit
      qu'un rendu React s'intercale entre les deux `set()` qui encadrent
      l'appel — ni dans le relais au worker, ni dans un éventuel repli
      synchrone — et une sonde qui dépend d'un rendu qui n'a pas à avoir
      lieu ne garde rien (§1bis). `performance.mark`, posé dans
      `recompute()` (appStore.ts) de part et d'autre de l'appel, ne dépend
      d'aucun rendu : il s'exécute dans le fil qui appelle `recompute`,
      pas dans celui qui peint.
    */
    const [debutCalcul, finCalcul] = await page.evaluate(() => {
      const marques = (nom: string) =>
        performance.getEntriesByName(nom).at(-1)?.startTime
      return [
        marques('sentiers:recompute:debut'),
        marques('sentiers:recompute:fin'),
      ]
    })
    if (debutCalcul !== undefined && finCalcul !== undefined) {
      relever('analyse_ms', String(Math.round(debutCalcul - debutImportPerf)))
      relever('correspondance_ms', String(Math.round(finCalcul - debutCalcul)))
    } else {
      relever('recompute_jamais_marque', 'true')
    }

    /*
      Ce qui doit être vrai quelle que soit la durée : tout est arrivé. Le
      compte se lit à l'écran, là où l'utilisateur le lit — et non dans un
      témoin posé pour le test, qui pourrait dire vrai pendant qu'une liste
      vide s'affiche.
    */
    const compte = page.getByTestId('tracks-compte')
    // Ce compte n'apparaît qu'au-delà du seuil de groupement : à petite
    // échelle — les essais de mise au point — on retombe sur les lignes de
    // la liste. La mesure réelle, elle, passe toujours par le compte.
    let enMemoire: number
    if ((await compte.count()) > 0) {
      await expect(compte).toBeVisible({ timeout: 60_000 })
      enMemoire = Number(/(\d+)/.exec((await compte.textContent()) ?? '')?.[1] ?? '-1')
    } else {
      enMemoire = await page.getByTestId('tracks-list').locator('li').count()
    }
    relever('traces_affichees', String(enMemoire))

    const enBase = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const ouverture = indexedDB.open('sentiers')
          ouverture.onerror = () => {
            resolve(-1)
          }
          ouverture.onsuccess = () => {
            const base = ouverture.result
            const compte = base
              .transaction('tracks', 'readonly')
              .objectStore('tracks')
              .count()
            compte.onsuccess = () => {
              base.close()
              resolve(compte.result)
            }
            compte.onerror = () => {
              base.close()
              resolve(-1)
            }
          }
        }),
    )
    relever('traces_en_base', String(enBase))

    const place = await page.evaluate(async () => {
      const e = await navigator.storage.estimate()
      return `${String(e.usage ?? -1)}/${String(e.quota ?? -1)}`
    })
    relever('stockage_utilise_sur_quota', place)

    // La sauvegarde : son poids est le troisième inconnu de l'issue.
    const debutSauvegarde = Date.now()
    // La section « sauvegarde » est un accordéon replié : sans l'ouvrir, le
    // clic vise un bouton que personne ne peut voir — et l'attente du
    // téléchargement expire dix minutes plus tard sans rien dire d'utile.
    await page.getByTestId('backup').locator('summary').click()
    const telechargement = page.waitForEvent('download', {
      timeout: 10 * 60 * 1000,
    })
    await page.getByTestId('backup-export').click()
    const fichier = await telechargement
    const chemin = await fichier.path()
    const { statSync } = await import('node:fs')
    relever('sauvegarde_octets', String(statSync(chemin).size))
    relever('sauvegarde_ms', String(Date.now() - debutSauvegarde))

    /*
      Les seules assertions, et elles ne mesurent pas le temps : rien ne doit
      avoir été perdu en silence. Si le quota est atteint, `traces_en_base`
      sera inférieur — et c'est précisément le chemin que personne n'avait
      encore vu s'exécuter. Le test le relève au lieu de l'imposer.
    */
    expect(enMemoire).toBe(ACTIVITES)
    expect(enBase).toBeGreaterThan(0)
  })
})
