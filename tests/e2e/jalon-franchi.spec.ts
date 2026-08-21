import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Franchissement d'un jalon. Fixture Pilat : le GPX décalé de 15 m au nord
 * couvre le GR 7 en entier ; à tolérance serrée il ne couvre rien. On part
 * donc de 0 %, on desserre, et le franchissement est annoncé.
 */
test('franchir un jalon est annoncé une fois, sobrement', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Tolérance serrée : la trace ne crédite rien.
  await page.getByTestId('tolerance-precis').check()
  await expect(page.getByTestId('tolerance-detail')).toContainText('25 m')
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')
  // Charger une zone ou importer une trace sans effet n'annonce rien.
  await expect(page.getByTestId('celebration')).toHaveCount(0)

  // On desserre : le GR 7 passe d'un coup à 100 %.
  await page.getByTestId('tolerance-normal').check()
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  const annonce = page.getByTestId('celebration')
  await expect(annonce).toBeVisible()
  await expect(annonce).toContainText('GR 7')
  await expect(annonce).toContainText('100 %')

  // Elle tient : un recalcul de fond — démarrage, arrivée des boucles
  // locales — l'effaçait dans la seconde, et le franchissement passait
  // inaperçu. Tant que le jalon reste atteint, l'annonce reste.
  // 60 m ne correspond à aucun cran nommé : c'est le réglage fin, en second
  // rideau, qui reste accessible pour qui le veut.
  await page.getByTestId('tolerance-detail').click()
  await page.getByTestId('tolerance-slider').fill('60')
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  await expect(annonce).toBeVisible()

  // Elle se referme et ne revient pas d'elle-même.
  await annonce.getByRole('button', { name: /masquer/i }).click()
  await expect(page.getByTestId('celebration')).toHaveCount(0)
})
