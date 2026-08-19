import { describe, it, expect, vi } from 'vitest'
import {
  downsample,
  buildElevationLineUrl,
  parseElevationResponse,
  fetchElevationProfile,
  elevationStats,
  fillElevationGaps,
  ElevationError,
  MAX_ELEVATION_POINTS,
} from '../../src/core/elevation.ts'
import { straightLine } from '../fixtures/synthetic.ts'
import type { LonLat } from '../../src/core/types.ts'

const LAT = 45.4

describe('downsample', () => {
  it('laisse une polyligne courte inchangée', () => {
    const coords: LonLat[] = [
      [4.5, 45.4],
      [4.51, 45.4],
    ]
    expect(downsample(coords, 100)).toEqual(coords)
  })

  it('réduit à N points en gardant le premier et le dernier', () => {
    const coords = straightLine(4.5, LAT, 10_000, 10) // 1001 points
    const reduced = downsample(coords, 50)
    expect(reduced).toHaveLength(50)
    expect(reduced[0]).toEqual(coords[0])
    expect(reduced[49]).toEqual(coords[coords.length - 1])
  })
})

describe('buildElevationLineUrl', () => {
  it('encode les points en paramètres lon/lat séparés par des barres', () => {
    const coords: LonLat[] = [
      [4.5, 45.4],
      [4.51, 45.41],
    ]
    const url = buildElevationLineUrl(coords)
    expect(url).toContain('data.geopf.fr/altimetrie')
    expect(url).toContain('lon=4.500000%7C4.510000') // %7C = |
    expect(url).toContain('lat=45.400000%7C45.410000')
    expect(url).toContain('resource=')
  })

  it('sous-échantillonne les longues polylignes', () => {
    const coords = straightLine(4.5, LAT, 50_000, 10) // 5001 points
    const url = buildElevationLineUrl(coords)
    const lonParam = new URL(url).searchParams.get('lon') ?? ''
    expect(lonParam.split('|')).toHaveLength(MAX_ELEVATION_POINTS)
  })
})

describe('parseElevationResponse', () => {
  const coords: LonLat[] = [
    [4.5, 45.4],
    [4.51, 45.41],
    [4.52, 45.42],
  ]

  it('extrait les altitudes dans l’ordre', () => {
    const data = {
      elevations: [{ z: 800 }, { z: 850 }, { z: 900 }],
    }
    expect(parseElevationResponse(data, coords)).toEqual([800, 850, 900])
  })

  it('convertit -99999 (zone non couverte) en null', () => {
    const data = { elevations: [{ z: 800 }, { z: -99999 }, { z: 900 }] }
    expect(parseElevationResponse(data, coords)).toEqual([800, null, 900])
  })

  it('lève une ElevationError si la réponse est illisible', () => {
    expect(() => parseElevationResponse({}, coords)).toThrow(ElevationError)
    expect(() => parseElevationResponse(null, coords)).toThrow(ElevationError)
  })
})

describe('elevationStats', () => {
  it('calcule D+ et D- avec hystérésis anti-bruit', () => {
    const stats = elevationStats([100, 150, 120, 200, 180])
    expect(stats).not.toBeNull()
    expect(stats?.gain).toBe(130) // +50, +80
    expect(stats?.loss).toBe(50) // -30 (150→120), -20 (200→180) sous seuil
  })

  it('retourne null sans données exploitables', () => {
    expect(elevationStats([])).toBeNull()
    expect(elevationStats([null, null])).toBeNull()
  })

  it('calcule min/max', () => {
    const stats = elevationStats([100, null, 300, 50])
    expect(stats?.min).toBe(50)
    expect(stats?.max).toBe(300)
  })
})

describe('fillElevationGaps', () => {
  it('interpole linéairement les trous entourés de valeurs connues', () => {
    expect(fillElevationGaps([100, null, null, 400])).toEqual([
      100, 200, 300, 400,
    ])
  })

  it('reprend la valeur connue la plus proche en tête/queue', () => {
    expect(fillElevationGaps([null, null, 500, null])).toEqual([
      500, 500, 500, 500,
    ])
  })

  it('laisse un profil sans trou inchangé', () => {
    expect(fillElevationGaps([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('retourne des zéros si aucune valeur n’est connue', () => {
    expect(fillElevationGaps([null, null])).toEqual([0, 0])
  })
})

describe('fetchElevationProfile', () => {
  const coords = straightLine(4.5, LAT, 1000, 100) // 11 points, 100 m de pas

  it('retourne distances cumulées et altitudes, requête bien formée', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elevations: coords.map((_, i) => ({ z: 800 + i * 5 })),
        }),
        { status: 200 },
      ),
    )
    const result = await fetchElevationProfile(coords, { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result.elevations).toHaveLength(coords.length)
    expect(result.distances).toHaveLength(coords.length)
    expect(result.distances[0]).toBe(0)
    expect(result.distances[10]).toBeCloseTo(1000, 0)
  })

  it('lève une ElevationError en français si le service échoue', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))
    await expect(fetchElevationProfile(coords, { fetchFn })).rejects.toThrow(
      ElevationError,
    )
    await expect(fetchElevationProfile(coords, { fetchFn })).rejects.toThrow(
      /altimétrique/i,
    )
  })

  it('lève une ElevationError sur réponse HTTP non-200', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('erreur', { status: 500 }))
    await expect(fetchElevationProfile(coords, { fetchFn })).rejects.toThrow(
      ElevationError,
    )
  })

  it('rejette un tracé trop court', async () => {
    await expect(fetchElevationProfile([[4.5, LAT]])).rejects.toThrow(
      ElevationError,
    )
  })
})
