import { test, expect } from '@playwright/test'
import { mockOverpass, mockTilesOk, buildGpx } from './helpers.ts'

interface TrailStats {
  base: number
  done: number
  styleEpoch: number
}

/**
 * Non-régression du repli de fond de carte : quand le flux IGN tombe APRÈS
 * le chargement des tracés, la carte bascule sur les tuiles OSM et les
 * tracés doivent être ré-appliqués aux sources recréées par setStyle.
 */
test('le repli IGN → OSM conserve les tracés affichés', async ({ page }) => {
  await mockTilesOk(page)
  await mockOverpass(page)
  await page.goto('/')

  // La carte exige WebGL : sans lui, ce scénario n'est pas testable ici.
  const hasMap = await page
    .waitForFunction(() => '__sentiersMap' in window, undefined, {
      timeout: 10_000,
    })
    .then(
      () => true,
      () => false,
    )
  test.skip(!hasMap, 'WebGL indisponible dans ce navigateur headless')

  // Charger la zone et importer une trace pendant que les tuiles IGN marchent.
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

  const stats = () =>
    page.evaluate(
      () =>
        (window as { __sentiersTrailStats?: TrailStats }).__sentiersTrailStats ??
        null,
    )
  const basemapUrl = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __sentiersMap?: {
            getStyle: () => { sources: Record<string, { tiles?: string[] }> }
          }
        }
      ).__sentiersMap
      const basemap = map?.getStyle().sources['basemap']
      return basemap?.tiles?.[0] ?? ''
    })

  await expect
    .poll(async () => (await stats())?.base ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(0)
  expect(await basemapUrl()).toContain('data.geopf.fr')
  const epochBefore = (await stats())!.styleEpoch

  // Le flux IGN tombe : les prochaines tuiles échouent.
  await page.unroute('https://data.geopf.fr/**')
  await page.route('https://data.geopf.fr/**', (route) => route.abort())
  // Forcer des demandes de tuiles pour accumuler les erreurs puis le repli.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const map = (
        window as unknown as {
          __sentiersMap?: { zoomTo: (z: number) => void; getZoom: () => number }
        }
      ).__sentiersMap
      map?.zoomTo(map.getZoom() + 0.7)
    })
    await page.waitForTimeout(300)
  }

  await expect
    .poll(basemapUrl, { timeout: 20_000 })
    .toContain('openstreetmap')

  // Les tracés (base + parcourus) ont été ré-appliqués au nouveau style.
  await expect
    .poll(async () => (await stats())?.styleEpoch ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(epochBefore)
  const finalStats = (await stats())!
  expect(finalStats.base).toBeGreaterThan(0)
  expect(finalStats.done).toBeGreaterThan(0)
})
