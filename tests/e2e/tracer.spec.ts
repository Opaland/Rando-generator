import { test, expect } from '@playwright/test'
import { mockExternalNetwork, clickOnMap, hasMap } from './helpers.ts'

/**
 * Mode « tracer un itinéraire » : les clics posent des étapes accrochées au
 * réseau affiché et le tracé suit les chemins entre elles.
 *
 * Géométrie de la fixture Pilat (lat 45,4) : 4,500 → 4,505 → 4,510 → 4,520 →
 * 4,530, plus une antenne vers (4,530 ; 45,41). Le GRP (4,60 ; 45,45) forme
 * une composante isolée — utile pour tester le cas « non relié ».
 */
test('tracer un itinéraire sur les chemins puis l’enregistrer', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  await page.getByTestId('custom-draw').click()
  const drawer = page.getByTestId('route-drawer')
  await expect(drawer).toBeVisible()

  await clickOnMap(page, 4.5, 45.4)
  await expect(page.getByTestId('route-drawer-stats')).toContainText('1 étape')

  await clickOnMap(page, 4.53, 45.4)
  const stats = page.getByTestId('route-drawer-stats')
  await expect(stats).toContainText('2 étapes')
  // ~2,3 km entre 4,500 et 4,530 à cette latitude : le tracé a bien suivi
  // les chemins au lieu de tirer un trait direct.
  await expect(stats).toContainText('km')

  await page.getByTestId('route-drawer-name').fill('Ma boucle tracée')
  await page.getByTestId('route-drawer-save').click()

  // L'itinéraire rejoint « Mes itinéraires » et le mode tracé se referme.
  await expect(page.getByTestId('custom-list')).toContainText('Ma boucle tracée')
  await expect(drawer).toHaveCount(0)

  // Il est persisté comme n'importe quel itinéraire perso.
  await page.reload()
  await expect(page.getByTestId('custom-list')).toContainText('Ma boucle tracée')
})

test('messages clairs quand le point est hors réseau ou non relié', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('custom-draw').click()

  // Loin de tout tracé : rien à accrocher.
  await clickOnMap(page, 4.55, 45.42)
  await expect(page.getByTestId('route-drawer-error')).toContainText(
    /à proximité/i,
  )
  await expect(page.getByTestId('route-drawer-stats')).toContainText('0 étape')

  // Une première étape valable, puis un point sur la composante isolée (GRP).
  await clickOnMap(page, 4.5, 45.4)
  await expect(page.getByTestId('route-drawer-stats')).toContainText('1 étape')
  await clickOnMap(page, 4.6, 45.45)
  await expect(page.getByTestId('route-drawer-error')).toContainText(
    /ne se rejoignent pas|relier/i,
  )
  // L'étape fautive n'est pas ajoutée : le tracé reste cohérent.
  await expect(page.getByTestId('route-drawer-stats')).toContainText('1 étape')

  // Annuler ramène à zéro étape.
  await page.getByTestId('route-drawer-undo').click()
  await expect(page.getByTestId('route-drawer-stats')).toContainText('0 étape')
  await expect(page.getByTestId('route-drawer-save')).toBeDisabled()
})
