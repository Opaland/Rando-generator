import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, fermerLeGuide, mockExternalNetwork } from './helpers.ts'

/** #643 — la liste suit la même règle que l'historique. */
test.use({ viewport: { width: 1280, height: 800 } })

test('le filtre de la liste trouve un nom sans son accent', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const liste = page.getByTestId('itinerary-list')
  const lignes = liste.getByRole('button', { name: /Sentier des Crêtes/ })
  await page.getByTestId('list-filter').fill('cretes')
  await expect(lignes).not.toHaveCount(0)
  // Le filtre filtre bien : le GR 7 ne reste pas parce que rien n'a réagi.
  await expect(liste.getByRole('button', { name: /GR 7/ })).toHaveCount(0)
})
