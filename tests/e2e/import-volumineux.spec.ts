import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

/**
 * Import multi-fichiers volumineux : l'attente doit avoir un sujet.
 *
 * Mesure faite sur cette machine : un GPX de 9 Mo (100 000 points) demande
 * ~320 ms de parsing plus ~100 ms de lecture. Ce n'est pas un gel de
 * plusieurs secondes, mais sur un lot de fichiers cela s'additionne — et
 * jusqu'ici l'interface n'annonçait qu'un « Import en cours… » muet.
 */
function gpxVolumineux(points: number, lat: number): string {
  const lignes: string[] = []
  for (let i = 0; i < points; i++) {
    const lon = 4.5 + (i / points) * 0.03
    lignes.push(
      `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><ele>${
        800 + (i % 150)
      }</ele></trkpt>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>2026-05-01T08:00:00Z</time></metadata>
  <trk><trkseg>${lignes.join('')}</trkseg></trk>
</gpx>`
}

test('un lot de gros GPX annonce le fichier en cours et arrive au bout', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const fichiers = [0, 1, 2].map((i) => ({
    name: `traversee-${i + 1}.gpx`,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      gpxVolumineux(40_000, 45.4 + (i * 15) / 111_195),
      'utf-8',
    ),
  }))

  // On ne l'attend pas : l'avancement doit être visible pendant l'import.
  const pose = page.getByTestId('gpx-input').setInputFiles(fichiers)
  await expect(page.getByTestId('gpx-importing')).toContainText(/sur 3/, {
    timeout: 20_000,
  })
  await pose

  await expect(page.getByTestId('gpx-importing')).toHaveCount(0, {
    timeout: 30_000,
  })
  const liste = page.getByTestId('tracks-list')
  await expect(liste).toContainText('traversee-1.gpx')
  await expect(liste).toContainText('traversee-3.gpx')
  // Les trois traces longent le GR 7 : la progression globale est calculée.
  await expect(page.getByTestId('global-pct')).not.toHaveText('0 %')
})
