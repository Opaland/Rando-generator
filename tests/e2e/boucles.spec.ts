import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import bouclesFixture from '../fixtures/boucles/metropole.json' with { type: 'json' }

test('la zone Rhône fusionne les boucles locales open data (réseau Boucle)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Remplace la route « asset vide » par la fixture de boucles : 3 boucles
  // exploitables (la 4e n'a pas de tracé valable).
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: bouclesFixture }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  // 3 itinéraires OSM (fixture Pilat servie pour toutes les zones mockées)
  // + 3 boucles locales de la fixture.
  await expect(page.getByTestId('zone-meta')).toContainText('6 itinéraires', {
    timeout: 15_000,
  })

  const list = page.getByTestId('itinerary-list')
  await expect(list).toContainText('Les Vallons de la Beffe')

  // Ouvrir la fiche détail depuis la liste puis le lien « Voir le détail » :
  // les infos pratiques open data (commune, difficulté, source) s'affichent.
  await list.getByRole('button', { name: /Les Vallons de la Beffe/ }).click()
  await page.getByTestId('itinerary-card-detail-link').click()
  const local = page.getByTestId('detail-local-info')
  await expect(local).toBeVisible()
  await expect(local).toContainText('Dardilly')
  await expect(local).toContainText('moyen')
  await expect(local).toContainText('Métropole de Lyon')

  // Le filtre « Boucle » masque/affiche les boucles locales.
  await page.getByTestId('itinerary-detail-close').click()
  await page.getByRole('checkbox', { name: 'Boucle' }).uncheck()
  await expect(list).not.toContainText('Les Vallons de la Beffe')
  await expect(list).toContainText('GR 7')
})

test('l’asset de boucles indisponible ne casse pas le chargement de zone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ status: 500, body: 'oups' }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('zone-error')).toHaveCount(0)
})
