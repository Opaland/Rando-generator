import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, mockElevation } from './helpers.ts'

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
  await afficherTousLesReseaux(page)

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
  await afficherTousLesReseaux(page)
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
  await afficherTousLesReseaux(page)
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

/**
 * #333 : une variante dont la ref dérive du tronc (« GR 500A » de « GR 500 »)
 * — l'une partage un way avec le tronc, l'autre non. Les deux pourcentages
 * de complétion restent comptés séparément (décision de Cédric, 25/09) ;
 * seul ce que dit la fiche change.
 */
function troncEtVariantes(): unknown {
  const troncon = (ref: number, kmDebut: number, kmFin: number) => ({
    type: 'way',
    ref,
    role: '',
    geometry: [
      { lat: 45.4, lon: 4.5 + kmDebut / 78 },
      { lat: 45.4, lon: 4.5 + kmFin / 78 },
    ],
  })
  const relation = (id: number, ref: string, members: unknown[]) => ({
    type: 'relation',
    id,
    tags: { type: 'route', route: 'hiking', network: 'nwn', ref, name: ref },
    members,
  })
  return {
    elements: [
      relation(3001, 'GR 500', [troncon(950, 0, 5), troncon(951, 5, 10)]),
      // Partage le way 950 avec le tronc.
      relation(3002, 'GR 500A', [troncon(950, 0, 5), troncon(952, 10, 15)]),
      // Ne partage aucun way avec le tronc, malgré le nom.
      relation(3003, 'GR 500B', [troncon(953, 20, 25)]),
    ],
  }
}

test('la fiche d’une variante dit son recouvrement avec le tronc (#333)', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(troncEtVariantes())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: 'GR 500A' })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const recouvrement = page.getByTestId('detail-recouvrement')
  // Way 950 (5 km) partagé sur un total de 10 km (way 950 + way 952) : 50 %
  // pile, pas une approximation — même géométrie des deux côtés du fixture.
  await expect(recouvrement).toContainText('Partage 50 % de son tracé avec GR 500')
  await expect(recouvrement).toContainText('comptés séparément')
})

test('une variante sans way commun le dit aussi, sans laisser croire à un recouvrement (#333)', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await mockElevation(page)
  overpass.setFixture(troncEtVariantes())
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: 'GR 500B' })
    .click()
  await page.getByTestId('itinerary-card-detail-link').click()

  await expect(page.getByTestId('detail-recouvrement')).toContainText(
    'Ne partage aucun tronçon avec GR 500',
  )
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
  await afficherTousLesReseaux(page)
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
