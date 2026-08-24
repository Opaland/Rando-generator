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

/**
 * Overpass ne signale pas ses échecs par un code HTTP (issue #283).
 *
 * Une requête qui dépasse son délai de 180 s ou sa mémoire répond **200**,
 * avec un corps JSON parfaitement bien formé dont `elements` est vide et
 * dont `remark` porte le motif. Rien dans la forme ne la distingue d'un
 * département qui n'aurait aucun sentier balisé.
 *
 * L'application affichait donc « Aucun itinéraire balisé trouvé dans cette
 * zone sur OpenStreetMap » — pour la Haute-Savoie. C'est la phrase qui fait
 * fermer l'application pour de bon, et c'est ce test qui la surveille.
 *
 * Le mot cherché est **le nôtre** (« trop vaste »), pas celui d'Overpass :
 * le motif brut est en anglais et parle de RAM, il n'a rien à faire à
 * l'écran.
 */
test('une zone qu’Overpass n’arrive pas à rendre le dit, au lieu de se dire vide', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Enregistrée après le mock général : la route la plus récente gagne.
  let appels = 0
  await page.route('**/api/interpreter', (route) => {
    appels += 1
    void route.fulfill({
      status: 200,
      json: {
        version: 0.6,
        elements: [],
        remark:
          'runtime error: Query timed out in "query" at line 3 after 180 seconds.',
      },
    })
  })
  await page.goto('/')

  await page.getByTestId('zone-haute-savoie').click()

  const erreur = page.getByTestId('zone-error')
  await expect(erreur).toBeVisible({ timeout: 20_000 })
  await expect(
    erreur,
    'un échec d’Overpass est présenté comme un département sans sentier',
  ).not.toContainText('Aucun itinéraire')
  await expect(erreur).toContainText(/trop vaste/i)
  // Le second miroir doit avoir été essayé : un miroir qui répond « je n'y
  // arrive pas » n'est pas un miroir qui a réussi.
  expect(appels).toBe(2)
})
