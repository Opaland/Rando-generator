import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, mockElevation } from './helpers.ts'

/**
 * Issue #160 — un signalement devient une contribution.
 *
 * Marc, baliseur bénévole, voit qu'il manque dix kilomètres à une relation.
 * Il connaît le terrain mieux qu'OpenStreetMap et n'avait aucun moyen d'aller
 * le corriger depuis ici.
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
        members: [troncon(950, 0, 5), troncon(951, 15, 20)],
      },
    ],
  }
}

test('une relation trouée mène à OpenStreetMap, cadrée sur le trou', async ({
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
  await afficherTousLesReseaux(page)
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 500/ })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const lien = page.getByTestId('lien-osm')
  await expect(lien).toBeVisible()

  const href = await lien.getAttribute('href')
  expect(href).toContain('openstreetmap.org/relation/3001')
  // Cadré sur le milieu du trou, et non au début du GR : c'est tout l'objet.
  expect(href).toMatch(/#map=\d+\/45\.4\/4\.6/)

  // Il s'ouvre ailleurs, et sans emporter la session avec lui.
  await expect(lien).toHaveAttribute('target', '_blank')
  await expect(lien).toHaveAttribute('rel', 'noreferrer')
})
