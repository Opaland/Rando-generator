import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * « Prochaine sortie » : la question qui vient juste après le pourcentage.
 * Fixture Pilat, STEP = 100 m : le Sentier des Crêtes a un tronçon de
 * 12 échantillons d'un seul tenant (1,2 km), le GR 7 trois tronçons de 8.
 */
test('la prochaine sortie propose le plus long tronçon restant', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // Rien à proposer tant qu'aucune zone n'est chargée.
  await expect(page.getByTestId('next-outing')).toHaveCount(0)

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const proposition = page.getByTestId('next-outing')
  await expect(proposition).toBeVisible()
  await expect(proposition).toContainText('Sentier des Crêtes')
  await expect(proposition).toContainText('GR 7')
  await expect(proposition).toContainText('d’un trait')

  // Cliquer une proposition sélectionne l'itinéraire dans la liste.
  await proposition.getByRole('button').first().click()
  await expect(
    page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: /Sentier des Crêtes/ }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Une fois le GR 7 parcouru, il ne fait plus partie des propositions.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'gr7.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  await expect(proposition).not.toContainText('GR 7')
  await expect(proposition).toContainText('Sentier des Crêtes')
})
