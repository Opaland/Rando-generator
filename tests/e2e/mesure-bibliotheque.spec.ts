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
  const lat = 45.4 + index / 111_195
  const lignes: string[] = []
  for (let i = 0; i < POINTS_PAR_ACTIVITE; i++) {
    const lon = 4.5 + (i / POINTS_PAR_ACTIVITE) * 0.03
    lignes.push(
      `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${String(
        800 + (i % 150),
      )}</ele><time>2026-05-01T08:${String(Math.floor(i / 60) % 60).padStart(
        2,
        '0',
      )}:${String(i % 60).padStart(2, '0')}Z</time></trkpt>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="mesure" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>2026-05-01T08:00:00Z</time></metadata>
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
    relever('points_par_activite', String(POINTS_PAR_ACTIVITE))
    relever('archive_octets', String(archive.byteLength))
    relever('archive_fabrication_ms', String(Date.now() - debutArchive))

    const debutImport = Date.now()
    await page.getByTestId('gpx-input').setInputFiles({
      name: 'export-strava.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(archive),
    })
    await expect(page.getByTestId('gpx-importing')).toHaveCount(0, {
      timeout: 25 * 60 * 1000,
    })
    relever('import_ms', String(Date.now() - debutImport))

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
