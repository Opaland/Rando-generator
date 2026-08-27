import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'
import { buildFit } from '../fixtures/fit.ts'

/**
 * Import d'un fichier de montre (FIT). La trace synthétique longe le GR 7 de
 * la fixture Pilat (lat 45,4 ; lon 4,50 → 4,53), décalée de 15 m au nord,
 * comme le GPX du scénario nominal — les deux formats doivent donner le
 * même résultat.
 */
function fitLeLongDuGr7(): Buffer {
  const lat = 45.4 + 15 / 111_195
  const records = []
  for (let i = 0; i <= 150; i++) {
    records.push({
      timestamp: 1_000_000 + i * 10,
      lat,
      lon: 4.5 + i * 0.0002,
      altitude: 800 + (i % 30),
    })
  }
  return Buffer.from(buildFit(records))
}

test('une trace de montre au format FIT s’importe comme un GPX', async ({
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
    name: 'activite.fit',
    mimeType: 'application/octet-stream',
    buffer: fitLeLongDuGr7(),
  })

  await expect(page.getByTestId('tracks-list')).toContainText('activite.fit')
  // Même couverture que le GPX équivalent du scénario nominal.
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // La date lue dans le fichier est affichée, et le D+ calculé.
  await expect(page.getByTestId('tracks-list')).toContainText('D+')
})

test('un FIT tronqué est refusé avec une explication', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  const complet = fitLeLongDuGr7()
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'coupe.fit',
    mimeType: 'application/octet-stream',
    // On coupe la fin : l'en-tête annonce plus de données qu'il n'en reste.
    buffer: complet.subarray(0, complet.length - 200),
  })

  await expect(page.getByTestId('gpx-errors')).toContainText('coupe.fit')
  await expect(page.getByTestId('gpx-errors')).toContainText(/incomplet/i)
})
