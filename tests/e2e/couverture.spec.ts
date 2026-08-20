import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Une trace au large du Pilat — la Bretagne fera l'affaire. Deux points
 * suffisent : ce qu'on vérifie, c'est le périmètre, pas la distance.
 */
function gpxAilleurs(isoDate = '2026-04-02T09:00:00Z'): string {
  const points: string[] = []
  for (let lon = -3.5; lon <= -3.4901; lon += 0.002) {
    points.push(`<trkpt lat="48.6000000" lon="${lon.toFixed(4)}"></trkpt>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>${isoDate}</time></metadata>
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}

test('le tableau de bord dit combien de sorties tombent hors de la zone chargée', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Une sortie dans le Pilat : elle compte des deux côtés, rien à expliquer.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'pilat.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  await expect(page.getByTestId('global-hors-zone')).toHaveCount(0)

  // Une sortie en Bretagne : « Mes sorties » la compte, le pourcentage non.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'bretagne.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpxAilleurs(), 'utf-8'),
  })
  await expect(page.getByTestId('history-totals')).toContainText('2 sorties')

  // Le pourcentage n'a pas bougé — et c'est maintenant dit pourquoi.
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  const note = page.getByTestId('global-hors-zone')
  await expect(note).toContainText('1 de vos 2 sorties')
  await expect(note).toContainText('hors de la zone chargée')

  // L'explication survit au rechargement, comme les traces.
  await page.reload()
  await expect(page.getByTestId('global-hors-zone')).toContainText(
    '1 de vos 2 sorties',
    { timeout: 15_000 },
  )
})
