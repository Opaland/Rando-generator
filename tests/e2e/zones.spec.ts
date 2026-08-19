import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'

test('les départements d’Auvergne-Rhône-Alpes sont chargeables', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-isere').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(1)

  // Une autre zone de la région reste accessible dans la foulée.
  await expect(page.getByTestId('zone-haute-savoie')).toBeEnabled()
})

test('un grand itinéraire se charge en un clic, sans taper sa ref', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // GR 65 = chemin de Saint-Jacques (voie du Puy) : traverse plusieurs
  // départements, donc chargé par ref sur la France entière.
  await page.getByTestId('featured-gr65').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  // Le bouton reflète la sélection en cours.
  await expect(page.getByTestId('featured-gr65')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
