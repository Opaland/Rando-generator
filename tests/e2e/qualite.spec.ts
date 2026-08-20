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

test('la liste marque les tracés incomplets sans qu’on ouvre leur fiche', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  overpass.setFixture(relationTrouee())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  await expect(
    page
      .getByTestId('itinerary-list')
      .getByRole('img', { name: /incomplet dans OpenStreetMap/i }),
  ).toBeVisible()
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
  // Et rien ne vient encombrer la liste non plus.
  await expect(
    page
      .getByTestId('itinerary-list')
      .getByRole('img', { name: /incomplet dans OpenStreetMap/i }),
  ).toHaveCount(0)
})

test('la fiche dit quand le tracé a été modifié dans OpenStreetMap', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  // L'application savait dire l'âge de sa copie ; elle ne savait rien dire de
  // l'âge de la donnée elle-même (issue #96).
  const amont = page.getByTestId('detail-osm-updated')
  await expect(amont).toContainText('02/04/2019')
  await expect(amont).toContainText('il y a')
  // Ancien n'est pas faux : le ton reste factuel, ce n'est pas un reproche.
  await expect(amont).toContainText('n’est pas forcément faux')
})
