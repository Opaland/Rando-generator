import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

/**
 * Issue #148 — une trace trop espacée pour être située doit le dire.
 *
 * Le scénario est celui d'une montre en économie de batterie : la sortie a
 * réellement eu lieu, elle est complète, et le pourcentage tombe à zéro.
 * Sans un mot à l'import, la personne lit ce zéro et conclut — à juste
 * titre, faute d'autre explication — que l'application est cassée.
 */
function gpxEspace(pasDegres: number, nombre: number): string {
  const points: string[] = []
  for (let i = 0; i < nombre; i += 1) {
    points.push(
      `<trkpt lat="45.4000000" lon="${(4.5 + i * pasDegres).toFixed(6)}"></trkpt>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>2024-06-15T08:30:00Z</time></metadata>
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}

test('une trace trop espacée est expliquée, pas seulement comptée à zéro', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // ~1,7 km entre deux points.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'montre-economie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpxEspace(0.022, 12), 'utf-8'),
  })

  const avertissement = page.getByTestId('gpx-errors')
  await expect(avertissement).toContainText('montre-economie.gpx')
  // Le chiffre est nommé, pas remplacé par un adjectif : « peu précise »
  // laisserait devant la même énigme que le zéro muet.
  await expect(avertissement).toContainText('un point tous les 1,7 km')

  // La trace est gardée : l'avertissement explique, il ne rejette pas.
  await expect(page.getByTestId('tracks-list')).toContainText(
    'montre-economie.gpx',
  )
})

test('une trace ordinaire n’est accompagnée d’aucun avertissement', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // ~16 m entre deux points : l'enregistrement normal d'une montre.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'normale.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpxEspace(0.0002, 60), 'utf-8'),
  })

  await expect(page.getByTestId('tracks-list')).toContainText('normale.gpx')
  await expect(page.getByTestId('gpx-errors')).toHaveCount(0)
})
