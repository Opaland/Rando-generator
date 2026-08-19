import type { Page } from '@playwright/test'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }

export const MIRROR_1 = 'https://overpass-api.de/api/interpreter'
export const MIRROR_2 = 'https://overpass.kumi.systems/api/interpreter'

/** PNG transparent 1×1, pour servir des tuiles valides sans réseau. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Coupe les serveurs de tuiles : les tests ne touchent jamais le réseau réel. */
export async function mockTiles(page: Page): Promise<void> {
  await page.route('https://data.geopf.fr/**', (route) => route.abort())
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.abort(),
  )
}

/** Sert des tuiles factices valides (pas d'erreur, pas de repli déclenché). */
export async function mockTilesOk(page: Page): Promise<void> {
  const serve = (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    route.fulfill({ contentType: 'image/png', body: TINY_PNG })
  await page.route('https://data.geopf.fr/**', serve)
  await page.route('https://tile.openstreetmap.org/**', serve)
}

export interface OverpassMock {
  count: () => number
  /** Remplace la réponse servie aux prochains appels. */
  setFixture: (fixture: unknown) => void
}

/**
 * Overpass mocké : répond avec la fixture enregistrée et retourne un compteur
 * d'appels (pour vérifier que le cache évite les requêtes).
 */
export async function mockOverpass(page: Page): Promise<OverpassMock> {
  let calls = 0
  let current: unknown = pilatFixture
  await page.route('**/api/interpreter', (route) => {
    calls += 1
    void route.fulfill({ json: current })
  })
  return {
    count: () => calls,
    setFixture: (fixture) => {
      current = fixture
    },
  }
}

/** Fixture réduite : seule la relation GR 7 reste (pour tester l'actualisation). */
export function pilatGrOnly(): unknown {
  const data = pilatFixture as { elements: { id: number }[] }
  return { ...data, elements: data.elements.filter((e) => e.id === 1001) }
}

export async function mockExternalNetwork(
  page: Page,
): Promise<{ count: () => number }> {
  await mockTiles(page)
  return mockOverpass(page)
}

/**
 * GPX synthétique : une ligne à latitude constante, décalée de `offsetNorthMeters`
 * au nord du tracé GR de la fixture Overpass (lat 45.4, lon 4.50 → 4.53).
 */
export function buildGpx(offsetNorthMeters: number): string {
  const lat = 45.4 + offsetNorthMeters / 111_195
  const points: string[] = []
  for (let lon = 4.5; lon <= 4.5301; lon += 0.0002) {
    points.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(4)}"></trkpt>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>2024-06-15T08:30:00Z</time></metadata>
  <trk><trkseg>${points.join('\n')}</trkseg></trk>
</gpx>`
}
