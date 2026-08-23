import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * Issue #161, point 1 — une étape en montagne est décidée par le refuge.
 *
 * Camille prépare trois semaines sur la Grande Traversée des Alpes. Un
 * découpage tous les 22 km qui la fait dormir à 4 km d'un refuge est joli sur
 * le papier et inutilisable sur le terrain.
 *
 * Ce fichier tient les deux moitiés : la coupure se cale quand un refuge est
 * là, et **la fiche le dit quand il n'y en a pas** — ce que l'issue demande
 * explicitement, plutôt que de couper au kilomètre en silence.
 */
function grLong(): unknown {
  const membres = [0, 1, 2].map((troncon) => ({
    type: 'way',
    ref: 900 + troncon,
    role: '',
    geometry: Array.from({ length: 21 }, (_, i) => ({
      lat: 45.4,
      lon: 4.5 + (troncon * 20 + i) / 78,
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

/** Un refuge posé à ~18 km du départ : dans la fenêtre de la coupure de 20 km. */
function refugeA18km(): unknown {
  return {
    elements: [
      {
        type: 'node',
        id: 7001,
        lat: 45.4,
        lon: 4.5 + 18 / 78,
        tags: { tourism: 'alpine_hut', name: 'Refuge de l’Essai' },
      },
    ],
  }
}

async function ouvrirLeGR(page: import('@playwright/test').Page) {
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 400/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()
  await expect(page.getByTestId('detail-stages')).toBeVisible()
}

test('une coupure se cale sur le refuge, et la fiche le dit', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(grLong())
  // La requête de POI se distingue par son contenu ; on lui sert le refuge.
  await page.route('**/api/interpreter', (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('drinking_water')) {
      void route.fulfill({ json: refugeA18km() })
      return
    }
    void route.fallback()
  })
  await page.goto('/')
  await ouvrirLeGR(page)

  const etapes = page.getByTestId('detail-stages')
  await expect(etapes).toContainText('Refuge de l’Essai', { timeout: 15_000 })
  await expect(page.getByTestId('etapes-explication')).toContainText(
    /calée?s? sur un refuge/,
  )
})

/**
 * Et sans refuge, on ne fait pas semblant : la fiche dit que les coupures
 * tombent au kilomètre.
 */
test('sans refuge connu, la fiche l’avoue', async ({ page }) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(grLong())
  await page.route('**/api/interpreter', (route) => {
    const body = route.request().postData() ?? ''
    if (body.includes('drinking_water')) {
      void route.fulfill({ json: { elements: [] } })
      return
    }
    void route.fallback()
  })
  await page.goto('/')
  await ouvrirLeGR(page)

  await expect(page.getByTestId('etapes-explication')).toContainText(
    'Aucun refuge connu près des coupures',
    { timeout: 15_000 },
  )
})
