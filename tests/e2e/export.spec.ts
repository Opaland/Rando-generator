import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'

test('exporter un itinéraire en GPX depuis la fiche détail', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('custom-input').setInputFiles({
    name: 'boucle-test.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(0), 'utf-8'),
  })
  const list = page.getByTestId('custom-list')
  await expect(list).toContainText('boucle-test')

  await list
    .getByRole('button', { name: /boucle-test/ })
    .filter({ hasNotText: 'Supprimer' })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('itinerary-detail-export').click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('sentiers-boucle-test.gpx')

  const path = await download.path()
  const gpx = await readFile(path, 'utf-8')
  expect(gpx).toContain('<gpx version="1.1"')
  expect(gpx).toContain('creator="Sentiers"')
  expect(gpx).toContain('<name>boucle-test</name>')
  expect(gpx).toContain('<trkpt lat="45.4000000"')
  // Tracé de l'utilisateur : rien à attribuer.
  expect(gpx).not.toContain('<copyright')
})

test('un itinéraire OSM exporté porte l’attribution ODbL', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('itinerary-detail-export').click()
  const download = await downloadPromise

  const path = await download.path()
  const gpx = await readFile(path, 'utf-8')
  // La donnée sort de l'app : le fichier doit porter sa licence.
  expect(gpx).toContain('<copyright author="les contributeurs OpenStreetMap">')
  expect(gpx).toContain('opendatacommons.org/licenses/odbl')
})
