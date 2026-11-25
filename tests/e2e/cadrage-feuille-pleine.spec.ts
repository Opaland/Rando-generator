import { test, expect, type Page } from '@playwright/test'
import { fermerLeGuide, hasMap, mockExternalNetwork, mockTilesOk, type MapLike } from './helpers.ts'

/**
 * #704, mesuré le 23/11 par `parcours` (Jeanine, 390 × 844, au doigt) : la
 * feuille dépliée en grand — le chemin naturel pour choisir une zone —
 * réservait au cadrage une marge basse plus haute que la carte. MapLibre
 * refusait alors de cadrer (« Map cannot fit within canvas… »), la caméra
 * restait sur le Pilat, et replier la feuille ne rattrapait rien : la zone
 * choisie n'était nulle part à l'écran.
 *
 * On mesure la caméra elle-même. Sans le correctif, elle restait sur le
 * Pilat, vers 4,55° E ; cadrée, l'Isère (de 4,74 à 6,36° E,
 * `core/emprisesDeZone.donnees.ts`) a son centre vers 5,55° E. « À l'est
 * de 5° E » sépare les deux sans recopier l'emprise : `tsconfig.node` ne
 * voit pas `src/`, et une seconde copie divergerait (§4ter). Dans un
 * `expect.poll`, parce que `fitBounds` anime la carte (§1bis).
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const centre = (page: Page) =>
  page.evaluate(() => {
    const map = (window as { __sentiersMap?: MapLike }).__sentiersMap
    if (!map || map.isMoving()) return null
    const { lng, lat } = map.getCenter()
    return [lng, lat] as const
  })

test('choisir une zone feuille pleine cadre la zone, et la replier la montre', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')
  await fermerLeGuide(page)

  const feuille = page.getByTestId('sidebar')
  for (let i = 0; i < 3 && (await feuille.getAttribute('data-position')) !== 'pleine'; i++) {
    await page.getByTestId('sheet-handle').click()
  }
  await expect(feuille).toHaveAttribute('data-position', 'pleine')

  await page.getByTestId('zone-isere').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', { timeout: 15_000 })

  const dansLaZone = async () => {
    const c = await centre(page)
    return c !== null && c[0] > 5
  }
  await expect.poll(dansLaZone, { timeout: 10_000 }).toBe(true)

  // Replier ne déplace pas la caméra : la zone reste celle qu'on regarde.
  for (let i = 0; i < 3 && (await feuille.getAttribute('data-position')) !== 'repliee'; i++) {
    await page.getByTestId('sheet-handle').click()
  }
  await expect(feuille).toHaveAttribute('data-position', 'repliee')
  await expect.poll(dansLaZone, { timeout: 5_000 }).toBe(true)
})
