import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import decouverteFixture from '../fixtures/boucles/decouverte.json' with { type: 'json' }

/**
 * « Trouver une sortie » : filtrer sur ce qu'on se demande la veille au soir
 * — combien de temps, combien ça grimpe, boucle ou aller simple, est-ce que
 * je retrouve ma voiture.
 *
 * Fixture : « Boucle du Vallon » (carré fermé, 1 h 30 publiée, 120 m D+) et
 * « Grande Traversée » (ligne ouverte, 4 h publiées, 800 m D+), plus les
 * 3 itinéraires OSM de la fixture Pilat (durées estimées, moins d'une heure).
 */
test('les filtres de découverte trient sur durée, forme et longueur', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: decouverteFixture }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  const list = page.getByTestId('itinerary-list')
  await expect(list).toContainText('Boucle du Vallon', { timeout: 15_000 })
  await expect(list).toContainText('Grande Traversée')

  // La durée publiée par la source est affichée telle quelle ; celle des
  // itinéraires OSM est estimée, et signalée comme telle par le « ≈ ».
  await expect(list).toContainText('1 h 30')
  await expect(list).toContainText('120 m D+')
  await expect(list).toContainText('boucle')
  await expect(list).toContainText('≈')

  await page.getByTestId('discovery-filters').locator('summary').click()

  // Moins de 2 h : la Grande Traversée (4 h) sort.
  await page.getByTestId('list-duration').selectOption({ label: 'moins de 2 h' })
  await expect(list).toContainText('Boucle du Vallon')
  await expect(list).not.toContainText('Grande Traversée')

  // Boucles seulement : il ne reste que le circuit fermé.
  await page.getByTestId('list-duration').selectOption({ label: 'peu importe' })
  await page.getByTestId('list-shape').selectOption('loop')
  await expect(list).toContainText('Boucle du Vallon')
  await expect(list).not.toContainText('Grande Traversée')
  await expect(list).not.toContainText('GR 7')

  // Un critère que personne ne satisfait le dit, au lieu d'afficher un vide.
  await page.getByTestId('list-length').selectOption({ label: 'plus de 20 km' })
  await expect(page.getByTestId('list-empty')).toBeVisible()

  // Réinitialiser rend tout le monde visible.
  await page.getByTestId('list-reset').click()
  await expect(list).toContainText('Boucle du Vallon')
  await expect(list).toContainText('Grande Traversée')
  await expect(list).toContainText('GR 7')
  await expect(page.getByTestId('list-reset')).toHaveCount(0)
})

test('le filtre de proximité ne retire rien tant que la position est inconnue', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: decouverteFixture }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  const list = page.getByTestId('itinerary-list')
  await expect(list).toContainText('Boucle du Vallon', { timeout: 15_000 })

  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('list-nearby').selectOption({ label: 'à moins de 5 km' })

  // Filtrer sur une donnée qu'on n'a pas reviendrait à vider la liste sans
  // raison : on le dit, et on ne retire rien.
  await expect(page.getByTestId('nearby-hint')).toBeVisible()
  await expect(list).toContainText('Boucle du Vallon')
  await expect(list).toContainText('Grande Traversée')
})
