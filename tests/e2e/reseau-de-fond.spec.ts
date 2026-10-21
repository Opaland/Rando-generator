import { test, expect } from '@playwright/test'
import {
  estAlEcran,
  fermerLeGuide,
  hasMap,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * Le réseau balisé du Département en Isère (PDIPR, #87).
 *
 * Ce que ce fichier garde, sur l'application construite : le jeu embarqué
 * arrive jusqu'à la carte pour l'Isère, la légende le nomme **parce qu'il
 * est peint**, et il disparaît quand on part pour une zone qu'il ne couvre
 * pas — sans quoi l'Isère resterait dessinée sous la Loire.
 *
 * Le nombre de tronçons se lit sur un témoin plutôt qu'au pixel : sans
 * WebGL, un fond ne se lit pas autrement (même raison que
 * `__sentiersTrailStats`).
 */
test.use({ viewport: { width: 1280, height: 800 } })

const tronconsPeints = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (window as { __sentiersReseauDeFond?: number }).__sentiersReseauDeFond ??
      null,
  )

test('l’Isère montre son réseau balisé, la Loire non', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')
  await fermerLeGuide(page)

  await page.getByTestId('zone-isere').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
  // Le jeu embarqué de l'Isère porte 15 313 tronçons le 18/10 : « des
  // milliers » suffit à dire qu'il est arrivé entier, sans épingler un
  // chiffre qui changera à la prochaine extraction.
  await expect.poll(() => tronconsPeints(page), { timeout: 15_000 }).toBeGreaterThan(
    10_000,
  )
  await expect
    .poll(() => estAlEcran(page, 'legende-reseau-de-fond'), { timeout: 5_000 })
    .toBe(true)

  await page.getByTestId('zone-loire').click()
  await expect.poll(() => tronconsPeints(page), { timeout: 15_000 }).toBe(0)
  await expect(page.getByTestId('legende-reseau-de-fond')).toHaveCount(0)
})

/*
  L'Ain, le 21/10 (#574) : 483 boucles nommées du Département, montrées en
  fond comme l'Isère et pas comptées — le dédoublonnage avec OpenStreetMap
  attend la décision de Cédric. Le jeu embarqué porte 531 lignes : « des
  centaines » suffit à dire qu'il est arrivé entier.
*/
test('l’Ain montre son réseau balisé, et la légende le nomme', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')
  await fermerLeGuide(page)

  await page.getByTestId('zone-ain').click()
  await expect.poll(() => tronconsPeints(page), { timeout: 15_000 }).toBeGreaterThan(400)
  await expect
    .poll(() => estAlEcran(page, 'legende-reseau-de-fond'), { timeout: 5_000 })
    .toBe(true)
})
