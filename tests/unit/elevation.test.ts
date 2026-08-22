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
  pointAtDistance,
  libelleResolution,
} from '../../src/core/elevation.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { sampleWay } from '../../src/core/sampling.ts'
import { straightLine } from '../fixtures/synthetic.ts'
import type { LonLat } from '../../src/core/types.ts'

const LAT = 45.4

/** Longueur d'une polyligne, en suivant chaque segment. */
function longueurPolyligne(coords: LonLat[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += distanceMeters(coords[i - 1] as LonLat, coords[i] as LonLat)
  }
  return total
}

/** Une réponse du service altimétrique, avec `n` altitudes plausibles. */
function reponseAltimetrique(n: number) {
  return () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          elevations: Array.from({ length: n }, (_, i) => ({
            z: 400 + Math.sin(i / 7) * 300,
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
}

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

describe('pointAtDistance', () => {
  const profil = {
    distances: [0, 100, 200],
    elevations: [800, 850, 900] as (number | null)[],
    coords: [
      [4.5, 45.4],
      [4.51, 45.4],
      [4.52, 45.4],
    ] as LonLat[],
  }

  it('situe un point au milieu de deux relevés', () => {
    const trouve = pointAtDistance(profil, 150)
    expect(trouve?.elevation).toBeCloseTo(875, 6)
    expect(trouve?.point[0]).toBeCloseTo(4.515, 6)
    expect(trouve?.distanceMeters).toBe(150)
  })

  it('retombe exactement sur un relevé', () => {
    expect(pointAtDistance(profil, 100)?.elevation).toBe(850)
    expect(pointAtDistance(profil, 0)?.point).toEqual([4.5, 45.4])
  })

  it('borne aux extrémités du tracé plutôt que d’extrapoler', () => {
    // Le curseur peut sortir du graphique : hors du tracé, il n'y a rien à
    // inventer, on reste au départ ou à l'arrivée.
    expect(pointAtDistance(profil, -50)?.distanceMeters).toBe(0)
    expect(pointAtDistance(profil, 10_000)?.distanceMeters).toBe(200)
    expect(pointAtDistance(profil, 10_000)?.point).toEqual([4.52, 45.4])
  })

  it('n’invente pas une altitude manquante', () => {
    const troue = { ...profil, elevations: [800, null, 900] }
    expect(pointAtDistance(troue, 150)?.elevation).toBeNull()
    // La position, elle, reste connue : le trou est altimétrique, pas géographique.
    expect(pointAtDistance(troue, 150)?.point[0]).toBeCloseTo(4.515, 6)
  })

  it('retourne null sans géométrie', () => {
    expect(
      pointAtDistance({ distances: [], elevations: [], coords: [] }, 0),
    ).toBeNull()
  })

  it('reste juste sur un profil plat de longueur nulle', () => {
    const plat = {
      distances: [0, 0],
      elevations: [800, 800],
      coords: [
        [4.5, 45.4],
        [4.5, 45.4],
      ] as LonLat[],
    }
    expect(pointAtDistance(plat, 0)?.elevation).toBe(800)
  })
})

/**
 * Retour utilisateur du 22/08 : « Via Lugdunum, Lyon to Le Puy-en-Velay,
 * km 21.4, l'altitude de 714 m ne correspond pas à l'altitude du point ».
 *
 * Deux causes, toutes deux lues dans le code et mesurées :
 *
 * 1. **L'axe des distances était calculé sur les points sous-échantillonnés.**
 *    Le profil mesurait donc les cordes entre échantillons, pas le sentier.
 *    Sur la géométrie OSM réelle du « Sentier des Crêtes » de la fixture,
 *    garder un point sur deux coûte 28,2 % de longueur. Le repère « 21,4 km »
 *    ne désignait pas le kilomètre 21,4 du terrain.
 *
 * 2. **L'altitude est interpolée entre deux échantillons.** Le profil est
 *    plafonné à cent points : sur 200 km, un relevé tous les 2 020 m. Un col
 *    entre deux relevés est invisible, et la valeur affichée est celle d'une
 *    droite tendue au-dessus du relief.
 *
 * La première se corrige, et c'est fait ici. La seconde est inhérente au
 * nombre de relevés : elle se dit, elle ne se cache pas.
 */
describe('l’axe des distances suit le sentier, pas les cordes', () => {
  /**
   * Un tracé dont les virages sont **plus fins que la résolution du profil**
   * — le cas réel : des lacets de quelques centaines de mètres sur un
   * itinéraire de plusieurs dizaines de kilomètres. Un premier essai
   * oscillait trop lentement (une période tous les 94 points) : le
   * sous-échantillonnage suivait encore la courbe, et le test ne mesurait
   * que 123 m d'écart. Il aurait passé sans le correctif.
   */
  function tracéSinueux(nbPoints: number): LonLat[] {
    return Array.from({ length: nbPoints }, (_, i) => {
      const t = i / (nbPoints - 1)
      return [4.5 + t * 0.5, 45.4 + Math.sin(i * 0.5) * 0.002] as LonLat
    })
  }

  it('rend la vraie longueur, et non celle des cordes entre relevés', async () => {
    const coords = tracéSinueux(600)
    const vraie = longueurPolyligne(coords)
    const cordes = longueurPolyligne(downsample(coords, MAX_ELEVATION_POINTS))
    // La sonde n'a de sens que si le sous-échantillonnage coupe vraiment
    // des virages : sans cela, le test passerait sur un tracé droit.
    expect(vraie - cordes).toBeGreaterThan(1000)

    const profile = await fetchElevationProfile(coords, {
      fetchFn: reponseAltimetrique(MAX_ELEVATION_POINTS),
    })
    const dernier = profile.distances[profile.distances.length - 1] ?? 0
    expect(dernier).toBeCloseTo(vraie, 0)
  })

  it('garde des distances croissantes et alignées sur les relevés', async () => {
    const coords = tracéSinueux(600)
    const profile = await fetchElevationProfile(coords, {
      fetchFn: reponseAltimetrique(MAX_ELEVATION_POINTS),
    })
    expect(profile.distances).toHaveLength(profile.coords.length)
    expect(profile.distances[0]).toBe(0)
    for (let i = 1; i < profile.distances.length; i++) {
      expect(profile.distances[i]).toBeGreaterThan(profile.distances[i - 1] as number)
    }
  })

  /**
   * L'accord qui manquait : le profil et le matching parlaient de deux
   * longueurs différentes pour le même itinéraire. Le matching parcourt la
   * géométrie complète par pas de 100 m ; le profil mesurait des cordes.
   */
  it('s’accorde avec la longueur que le matching mesure', async () => {
    const coords = tracéSinueux(600)
    const profile = await fetchElevationProfile(coords, {
      fetchFn: reponseAltimetrique(MAX_ELEVATION_POINTS),
    })
    const dernier = profile.distances[profile.distances.length - 1] ?? 0
    const parLeMatching = sampleWay(coords, 100).length * 100
    // Le matching quantifie par pas de 100 m : on tolère un pas d'écart.
    expect(Math.abs(dernier - parLeMatching)).toBeLessThan(200)
  })
})

describe('la résolution du profil se dit', () => {
  it('se tait quand les relevés sont serrés', () => {
    const profile = {
      distances: [0, 100, 200, 300],
      elevations: [800, 810, 820, 830],
      coords: [
        [4.5, 45.4],
        [4.501, 45.4],
        [4.502, 45.4],
        [4.503, 45.4],
      ] as LonLat[],
    }
    expect(libelleResolution(profile)).toBeNull()
  })

  it('annonce l’espacement quand un col peut s’y cacher', () => {
    const profile = {
      distances: [0, 2020, 4040],
      elevations: [400, 714, 900],
      coords: [
        [4.5, 45.4],
        [4.52, 45.4],
        [4.54, 45.4],
      ] as LonLat[],
    }
    const libelle = libelleResolution(profile)
    expect(libelle).toContain('2,0 km')
    expect(libelle).toMatch(/col|entre deux/i)
  })

  it('ne dit rien d’un profil vide ou d’un point unique', () => {
    expect(libelleResolution({ distances: [], elevations: [], coords: [] })).toBeNull()
    expect(
      libelleResolution({
        distances: [0],
        elevations: [800],
        coords: [[4.5, 45.4]],
      }),
    ).toBeNull()
  })
})
