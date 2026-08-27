import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, buildGpx } from './helpers.ts'

test('le bilan s’enregistre en image, fabriquée sur l’appareil', async ({
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
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  const telechargement = page.waitForEvent('download')
  await page.getByTestId('share-summary').click()
  const fichier = await telechargement

  expect(fichier.suggestedFilename()).toMatch(
    /^bilan-sentiers-\d{4}-\d{2}-\d{2}\.png$/,
  )
  const flux = await fichier.createReadStream()
  const morceaux: Buffer[] = []
  for await (const morceau of flux) morceaux.push(morceau as Buffer)
  const contenu = Buffer.concat(morceaux)
  // Un vrai PNG, et pas une image vide.
  expect([...contenu.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(contenu.byteLength).toBeGreaterThan(5_000)
})
