import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Seuil « bouclé » réglable (issue #92).
 *
 * La condition posée par l'issue : le seuil retenu doit rester affiché
 * partout où le mot « bouclé » apparaît. Sans quoi le mot devient un
 * mensonge personnalisable.
 */
test('le seuil « bouclé » se règle, se voit, et survit au rechargement', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')

  // Le jeu d'essai boucle un itinéraire à 100 % : il compte quel que soit
  // le seuil, et c'est le libellé qui doit suivre le réglage.
  const boucles = page.getByTestId('global-completed')
  await expect(boucles).toContainText('au moins 95 % parcourus')

  await page.getByTestId('completion-90').check()
  await expect(boucles).toContainText('au moins 90 % parcourus')

  await page.getByTestId('completion-100').check()
  await expect(boucles).toContainText('au moins 100 % parcourus')

  // Le réglage se garde, comme la tolérance.
  await page.reload()
  await expect(page.getByTestId('completion-100')).toBeChecked({
    timeout: 15_000,
  })
})
