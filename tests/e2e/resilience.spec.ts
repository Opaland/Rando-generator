import { test, expect } from '@playwright/test'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }
import {
  mockTiles,
  mockOverpass,
  pilatGrOnly,
  MIRROR_1,
  MIRROR_2,
} from './helpers.ts'

test('bascule sur le second miroir Overpass si le premier échoue', async ({
  page,
}) => {
  await mockTiles(page)
  let mirror1Calls = 0
  let mirror2Calls = 0
  await page.route(MIRROR_1, (route) => {
    mirror1Calls += 1
    void route.abort()
  })
  await page.route(MIRROR_2, (route) => {
    mirror2Calls += 1
    void route.fulfill({ json: pilatFixture })
  })

  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  expect(mirror1Calls).toBe(1)
  expect(mirror2Calls).toBe(1)
  // Pas de message d'erreur : la bascule est transparente.
  await expect(page.getByTestId('zone-error')).toHaveCount(0)
})

test('« Actualiser les tracés » recharge une zone en ignorant le cache', async ({
  page,
}) => {
  await mockTiles(page)
  const overpass = await mockOverpass(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(1)

  // Les données côté OSM ont « changé » : la fixture ne contient plus que le GR 7.
  overpass.setFixture(pilatGrOnly())
  await page.getByTestId('zone-refresh').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(2)
})

test('changer de zone met à jour les données ; zéro résultat est expliqué', async ({
  page,
}) => {
  await mockTiles(page)
  const overpass = await mockOverpass(page)
  await page.goto('/')

  // Zone 1 : la fixture complète.
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Zone 2 : Overpass renvoie d'autres données → l'UI doit refléter le changement.
  overpass.setFixture(pilatGrOnly())
  await page.getByTestId('zone-rhone').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(2)

  // Zone 3 : aucun itinéraire → message explicite, interface non bloquée.
  overpass.setFixture({ version: 0.6, elements: [] })
  await page.getByTestId('zone-loire').click()
  await expect(page.getByTestId('zone-error')).toContainText(
    /aucun itinéraire/i,
    { timeout: 15_000 },
  )
  await expect(page.getByTestId('zone-meta')).toContainText('0 itinéraire')
  // Les boutons de zone sont réactivés : on peut recharger ailleurs.
  await expect(page.getByTestId('zone-pilat')).toBeEnabled()
})

test('recherche par ref : chargement puis actualisation possibles', async ({
  page,
}) => {
  await mockTiles(page)
  const overpass = await mockOverpass(page)
  await page.goto('/')

  await page.getByTestId('ref-input').fill('GR 7')
  await page.getByTestId('ref-submit').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(1)

  // Le bouton d'actualisation existe aussi pour les recherches par ref.
  overpass.setFixture(pilatGrOnly())
  await page.getByTestId('zone-refresh').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(2)
})
