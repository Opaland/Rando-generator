import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * Qualité de la donnée : une relation OSM trouée produit un pourcentage
 * calculé sur ce qui est présent, sans mentionner ce qui manque. On le dit.
 */
function relationTrouee(): unknown {
  const troncon = (ref: number, kmDebut: number, kmFin: number) => ({
    type: 'way',
    ref,
    role: '',
    geometry: [
      { lat: 45.4, lon: 4.5 + kmDebut / 78 },
      { lat: 45.4, lon: 4.5 + kmFin / 78 },
    ],
  })
  return {
    elements: [
      {
        type: 'relation',
        id: 3001,
        tags: {
          type: 'route',
          route: 'hiking',
          network: 'nwn',
          ref: 'GR 500',
          name: 'Relation incomplète',
        },
        // Deux morceaux séparés par 10 km sans géométrie.
        members: [troncon(950, 0, 5), troncon(951, 15, 20)],
      },
    ],
  }
}

test('une relation trouée le dit au lieu d’afficher un pourcentage muet', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(relationTrouee())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 500/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const qualite = page.getByTestId('detail-quality')
  await expect(qualite).toBeVisible()
  await expect(qualite).toContainText('2 morceaux')
  await expect(qualite).toContainText(/interruptions/)
})

test('une relation continue n’affiche aucun avertissement', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GRP Tour du Pilat/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  await expect(page.getByTestId('itinerary-detail')).toBeVisible()
  await expect(page.getByTestId('detail-quality')).toHaveCount(0)
})
