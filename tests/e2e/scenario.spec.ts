import { test, expect } from '@playwright/test'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Scénario nominal complet, Overpass mocké (fixture enregistrée) :
 * charger une zone → importer un GPX → vérifier les % → changer la
 * tolérance → vérifier le recalcul → recharger → vérifier la persistance.
 *
 * Chiffres attendus (fixture pilat.json, STEP = 100 m) :
 * - GR 7 : 3 ways de ~781 m → 24 échantillons
 * - Sentier des Crêtes (PR) : way partagé (8) + way de ~1112 m (12) → 20
 * - GRP Tour du Pilat : 8 — le GPX ne le couvre pas
 * - global (ways dédupliqués) : 44 échantillons
 * Le GPX est décalé de 30 m au nord du GR 7 : à TOL = 50 m, 25/44 faits
 * (24 du GR 7 + le 1er échantillon du way 300) → 56,8 % ; à TOL = 25 m → 0 %.
 */
test('charge une zone, importe un GPX, recalcule et persiste', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await page.goto('/')

  // 1. Charger la zone PNR du Pilat (Overpass mocké).
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBe(1)

  // Sans trace : 0 %.
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')

  // 2. Importer un GPX décalé de 30 m au nord du GR 7.
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie-pilat.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(30), 'utf-8'),
  })
  await expect(page.getByTestId('tracks-list')).toContainText(
    'sortie-pilat.gpx',
  )

  // 3. Les % correspondent à la fixture.
  await expect(page.getByTestId('global-pct')).toHaveText('56,8 %')
  await page
    .getByTestId('itinerary-list')
    .getByRole('button', { name: /GR 7/ })
    .click()
  await expect(page.getByTestId('itinerary-card-pct')).toHaveText('100 %')

  // Le top 5 place le GR 7 en tête.
  await expect(page.getByTestId('top5')).toContainText('GR 7')

  // 4. Resserrer la tolérance à 25 m → recalcul → plus rien ne matche.
  await page.getByTestId('tolerance-slider').fill('25')
  await expect(page.getByTestId('tolerance-value')).toHaveText('25 m')
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')
  await expect(page.getByTestId('itinerary-card-pct')).toHaveText('0 %')

  // 5. Recharger : plus aucun appel Overpass autorisé, tout vient d'IndexedDB.
  await page.unroute('**/api/interpreter')
  await page.route('**/api/interpreter', (route) => route.abort())
  await page.reload()

  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires')
  await expect(page.getByTestId('tracks-list')).toContainText(
    'sortie-pilat.gpx',
  )
  await expect(page.getByTestId('tolerance-value')).toHaveText('25 m')
  await expect(page.getByTestId('global-pct')).toHaveText('0 %')
  expect(overpass.count()).toBe(1)
})

test('affiche un message clair pour un GPX corrompu', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('gpx-input').setInputFiles({
    name: 'corrompu.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<gpx><trk><trkseg><trkpt lat="45', 'utf-8'),
  })
  await expect(page.getByTestId('gpx-errors')).toContainText('corrompu.gpx')
  await expect(page.getByTestId('gpx-errors')).toContainText('XML valide')
})

test('la page À propos affiche licences, marques et privacy', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('about-open').click()
  const dialog = page.getByTestId('about-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('OpenStreetMap')
  await expect(dialog).toContainText('ODbL')
  await expect(dialog).toContainText('Etalab')
  await expect(dialog).toContainText('marques de la FFRandonnée')
  await expect(dialog).toContainText('votre navigateur')
})

test('message honnête si Overpass est injoignable', async ({ page }) => {
  await page.route('**/api/interpreter', (route) => route.abort())
  await page.route('https://data.geopf.fr/**', (route) => route.abort())
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  )
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-error')).toContainText(
    /serveurs|réessayez/i,
    { timeout: 15_000 },
  )
})
