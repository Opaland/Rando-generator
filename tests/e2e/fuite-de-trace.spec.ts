import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockTilesOk, fermerLeGuide } from './helpers.ts'

/**
 * Issue #178 — le compteur « contenait vos traces » est une mesure.
 *
 * ## Ce que ce fichier existe pour empêcher
 *
 * Le panneau « Ce qui est sorti d'ici » affichait
 * `<strong data-testid="sorties-traces">0</strong>` — **un zéro écrit en
 * dur**, dans le JSX. L'application présentait comme un fait vérifié un
 * nombre qui ne pouvait pas changer, et une note affirmait qu'« un test le
 * vérifie à chaque livraison ». Ce test n'existait pas.
 *
 * C'est le §1 porté dans l'interface, et c'est plus grave qu'un test creux :
 * un chiffre affiché est plus difficile à remettre en cause qu'une phrase,
 * parce qu'il a l'air d'être compté.
 *
 * ## Ce que ce fichier prouve, et comment
 *
 * Le second test **injecte une fuite** : une requête qui emporte réellement
 * un point de la trace importée. Sans lui, le premier test serait vert sur
 * une application qui enverrait tout — exactement l'état d'avant.
 */

/** Des coordonnées à pleine précision, qu'on saura reconnaître ailleurs. */
const LON = 4.512345
const LAT = 45.412345

function gpxReconnaissable(): string {
  const points = Array.from({ length: 12 }, (_, i) => {
    const lon = (LON + i * 1e-4).toFixed(6)
    const lat = (LAT + i * 1e-4).toFixed(6)
    return `<trkpt lat="${lat}" lon="${lon}"><time>2026-08-01T08:0${String(i % 10)}:00Z</time></trkpt>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>sortie surveillée</name><trkseg>${points}</trkseg></trk>
</gpx>`
}

async function importerEtOuvrirLePanneau(
  page: import('@playwright/test').Page,
) {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'surveillee.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpxReconnaissable(), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText(
    'surveillee.gpx',
    { timeout: 15_000 },
  )
}

test('une session ordinaire n’emporte aucun point de vos traces', async ({
  page,
}) => {
  await importerEtOuvrirLePanneau(page)

  await page.getByTestId('about-open').click()
  const total = page.getByTestId('sorties-total')
  await expect(total).toBeVisible()

  /*
    Le compteur total doit être non nul : sans requête, le second chiffre
    serait à zéro pour la raison la plus creuse qui soit — rien n'est parti.
  */
  const parties = Number((await total.textContent()) ?? '0')
  expect(parties).toBeGreaterThan(0)

  await expect(page.getByTestId('sorties-traces')).toHaveText('0')
  await expect(page.getByTestId('fuite-trace')).toHaveCount(0)
})

test('une fuite injectée est vue, et dite', async ({ page }) => {
  await importerEtOuvrirLePanneau(page)

  /*
    On envoie nous-mêmes un point de la trace, exactement comme le ferait un
    code qui aurait fuité — même chemin (`fetch`), même forme (un corps
    textuel). Le détecteur n'a aucune raison de savoir que c'est un test.
  */
  await page.evaluate(
    async ([lon, lat]) => {
      await fetch('/__sonde-de-fuite', {
        method: 'POST',
        body: JSON.stringify({ points: [[lon, lat]] }),
      }).catch(() => undefined)
    },
    [LON, LAT],
  )

  await page.getByTestId('about-open').click()
  await expect(page.getByTestId('sorties-traces')).toHaveText('1')
  const alerte = page.getByTestId('fuite-trace')
  await expect(alerte).toBeVisible()
  await expect(alerte).toContainText(/défaut grave/i)
})
