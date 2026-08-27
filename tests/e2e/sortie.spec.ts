import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * « Ce jour-là, vous avez couvert X km du GR 7 » (issue #6). Le tableau de
 * bord répond à « où en suis-je ? » ; une trace répond à « qu'est-ce que
 * j'ai fait ce jour-là ? ».
 */
test('déplier une trace montre ce que la sortie a fait avancer', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie-du-15-juin.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15, '2024-06-15T08:30:00Z'), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Rien n'est déplié tant qu'on ne le demande pas.
  await expect(page.getByTestId('track-outing')).toHaveCount(0)

  await page.getByTestId('track-toggle-sortie-du-15-juin.gpx').click()
  const bilan = page.getByTestId('track-outing')
  await expect(bilan).toBeVisible()
  await expect(bilan).toContainText('15 juin 2024')
  await expect(bilan).toContainText('GR 7')
  await expect(bilan).toContainText('km')

  // Un second clic replie.
  await page.getByTestId('track-toggle-sortie-du-15-juin.gpx').click()
  await expect(page.getByTestId('track-outing')).toHaveCount(0)
})

test('une sortie hors des itinéraires balisés le dit sans détour', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // 5 km au nord de tout tracé de la fixture.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'ailleurs.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(5_000, '2024-07-01T08:30:00Z'), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText('ailleurs.gpx')

  await page.getByTestId('track-toggle-ailleurs.gpx').click()
  await expect(page.getByTestId('track-outing')).toContainText(
    /aucun itinéraire balisé/i,
  )
})
