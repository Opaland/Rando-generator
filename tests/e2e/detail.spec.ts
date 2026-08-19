import { test, expect, type Page } from '@playwright/test'
import {
  mockExternalNetwork,
  mockElevation,
  buildGpx,
} from './helpers.ts'

interface MapLike {
  project: (lngLat: [number, number]) => { x: number; y: number }
  getZoom: () => number
  getCenter: () => { lng: number; lat: number }
  getPitch: () => number
  isMoving: () => boolean
}

/** Clique un point géographique sur la carte (coordonnées carte → écran). */
async function clickOnMap(page: Page, lon: number, lat: number): Promise<void> {
  // La caméra peut encore finir un fitBounds animé : attendre l'arrêt avant
  // de projeter, sinon le point calculé dérive de la ligne (tolérance de
  // clic quasi nulle sur une géométrie « line » de 2 px).
  await page.waitForFunction(
    () =>
      !(window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.isMoving(),
  )
  const mapBox = await page.getByTestId('map').boundingBox()
  if (!mapBox) throw new Error('Carte introuvable')
  const point = await page.evaluate(
    ([lonArg, latArg]) => {
      const map = (window as unknown as { __sentiersMap?: MapLike })
        .__sentiersMap
      if (!map) return null
      return map.project([lonArg, latArg])
    },
    [lon, lat] as const,
  )
  if (!point) throw new Error('Carte non initialisée (WebGL indisponible ?)')
  await page.mouse.click(mapBox.x + point.x, mapBox.y + point.y)
}

async function hasMap(page: Page): Promise<boolean> {
  return page
    .waitForFunction(() => '__sentiersMap' in window, undefined, {
      timeout: 10_000,
    })
    .then(
      () => true,
      () => false,
    )
}

test('cliquer un tracé sur la carte ouvre la fiche détail (altimétrie + POI)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Un point du GR 7 (way 100 de la fixture Pilat, lat 45.4, lon 4.5–4.505).
  await clickOnMap(page, 4.502, 45.4)

  const detail = page.getByTestId('itinerary-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('GR 7')

  // Profil altimétrique : le service mocké répond, les stats D+/D- s'affichent.
  await expect(detail).toContainText('D+', { timeout: 10_000 })

  // Points d'intérêt de la fixture POI.
  const poiList = page.getByTestId('detail-poi-list')
  await expect(poiList).toBeVisible({ timeout: 10_000 })
  await expect(poiList).toContainText('Point de vue sur la vallée')
  await expect(poiList).toContainText('Crêt de la Perdrix')

  // La fiche résumé (petite carte) ne s'affiche plus en même temps.
  await expect(page.getByTestId('itinerary-card')).toHaveCount(0)

  // Fermeture.
  await page.getByTestId('itinerary-detail-close').click()
  await expect(detail).toHaveCount(0)
})

test('la vue 3D incline la caméra ; la fermer la remet à plat', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await clickOnMap(page, 4.502, 45.4)
  await expect(page.getByTestId('itinerary-detail')).toBeVisible()

  const pitch = () =>
    page.evaluate(
      () =>
        (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getPitch() ??
        0,
    )
  expect(await pitch()).toBe(0)

  await page.getByTestId('detail-3d-toggle').click()
  await expect.poll(pitch, { timeout: 8000 }).toBeGreaterThan(0)

  await page.getByTestId('itinerary-detail-close').click()
  await expect.poll(pitch, { timeout: 8000 }).toBe(0)
})

test('sélectionner un itinéraire depuis la liste zoome dessus sans ouvrir le détail', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  const zoomBefore = await page.evaluate(
    () =>
      (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getZoom() ??
      0,
  )

  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()

  // La fiche résumé s'affiche (pas la fiche détail).
  await expect(page.getByTestId('itinerary-card')).toBeVisible()
  await expect(page.getByTestId('itinerary-detail')).toHaveCount(0)

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __sentiersMap?: MapLike }).__sentiersMap?.getZoom() ??
            0,
        ),
      { timeout: 10_000 },
    )
    .not.toBe(zoomBefore)
})

test('une trace importée met bien la fiche détail à 100 % (altimétrie indisponible tolérée)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Pas de mockElevation ici : le service IGN est coupé par mockTiles
  // (data.geopf.fr/**) — la fiche doit rester utilisable sans relief.
  await page.goto('/')

  test.skip(!(await hasMap(page)), 'WebGL indisponible dans ce navigateur headless')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(30), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('56,8 %')

  await clickOnMap(page, 4.502, 45.4)
  const detail = page.getByTestId('itinerary-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('100 %')
  // Message d'indisponibilité du relief, sans jamais bloquer l'affichage.
  await expect(detail).toContainText(/altimétrique/i, { timeout: 10_000 })
})
