import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * Étapes d'un long itinéraire. La fixture Pilat ne contient que des tracés de
 * quelques kilomètres : on sert ici un GR de 60 km, en trois tronçons de
 * 20 km, pour que le découpage ait un sujet.
 */
function grLong(): unknown {
  const membres = [0, 1, 2].map((tronçon) => ({
    type: 'way',
    ref: 900 + tronçon,
    role: '',
    geometry: Array.from({ length: 21 }, (_, i) => ({
      lat: 45.4,
      // ~1 km par point à cette latitude (1° ≈ 78 km en longitude).
      lon: 4.5 + (tronçon * 20 + i) / 78,
    })),
  }))
  return {
    elements: [
      {
        type: 'relation',
        id: 2001,
        tags: {
          type: 'route',
          route: 'hiking',
          network: 'nwn',
          ref: 'GR 400',
          name: 'Grande traversée d’essai',
        },
        members: membres,
      },
    ],
  }
}

test('un long itinéraire se découpe en étapes cadrables sur la carte', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(grLong())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 400/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const etapes = page.getByTestId('detail-stages')
  await expect(etapes).toBeVisible()
  await expect(etapes.locator('li')).toHaveCount(3)
  await expect(etapes).toContainText('Étape 1')
  await expect(etapes).toContainText('Étape 3')
  // Le découpage est annoncé comme calculé, pas comme celui d'un topo-guide.
  await expect(page.getByTestId('itinerary-detail')).toContainText(
    /topo-guide/i,
  )

  // Cliquer une étape cadre la carte dessus.
  await etapes.getByRole('button').nth(2).click()
  await expect(etapes).toBeVisible()
})
