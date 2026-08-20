import { describe, it, expect } from 'vitest'
import {
  buildTrailGeoJSON,
  buildTracksGeoJSON,
  itineraryCoords,
} from '../../src/core/mapdata.ts'
import { buildSamples } from '../../src/core/matching.ts'
import { polylineLengthMeters, sampleWay } from '../../src/core/sampling.ts'
import type { Itinerary, LonLat, Sample } from '../../src/core/types.ts'
import { straightLine, makeItinerary } from '../fixtures/synthetic.ts'
import type { Track } from '../../src/core/types.ts'

const LAT = 45.4

describe('buildTrailGeoJSON', () => {
  const line = straightLine(4.5, LAT, 1000, 100)
  const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])

  it('produit une feature de base par way avec réseau et itinéraire', () => {
    const samples = buildSamples([itin], 100)
    const { base } = buildTrailGeoJSON([itin], samples)
    expect(base.features).toHaveLength(1)
    const f = base.features[0]!
    expect(f.geometry.type).toBe('LineString')
    expect(f.geometry.coordinates).toHaveLength(11)
    expect(f.properties.network).toBe('GR')
    expect(f.properties.itineraryId).toBe(1)
  })

  it('regroupe les échantillons faits consécutifs en tronçons « parcourus »', () => {
    const samples = buildSamples([itin], 100)
    // Échantillons 0–3 et 7–8 faits : deux tronçons de ≥ 2 points.
    for (const i of [0, 1, 2, 3, 7, 8]) samples[i]!.done = true
    const { done } = buildTrailGeoJSON([itin], samples)
    expect(done.features).toHaveLength(2)
    expect(done.features[0]!.geometry.coordinates).toHaveLength(4)
    expect(done.features[1]!.geometry.coordinates).toHaveLength(2)
  })

  it('ignore les tronçons faits d’un seul échantillon isolé', () => {
    const samples = buildSamples([itin], 100)
    samples[5]!.done = true
    const { done } = buildTrailGeoJSON([itin], samples)
    expect(done.features).toHaveLength(0)
  })

  it('un way partagé prend le réseau le plus « fort » (GR > GRP > PR)', () => {
    const shared = { osmWayId: 10, coords: line }
    const pr = makeItinerary(2, [shared], { network: 'PR', ref: 'PR X' })
    const gr = makeItinerary(1, [shared], { network: 'GR' })
    const samples = buildSamples([pr, gr], 100)
    const { base } = buildTrailGeoJSON([pr, gr], samples)
    expect(base.features[0]!.properties.network).toBe('GR')
  })

  it('liste tous les itinéraires d’un way partagé (pour le surlignage)', () => {
    const shared = { osmWayId: 10, coords: line }
    const pr = makeItinerary(2, [shared], { network: 'PR', ref: 'PR X' })
    const gr = makeItinerary(1, [shared], { network: 'GR' })
    const samples = buildSamples([pr, gr], 100)
    for (const i of [0, 1]) samples[i]!.done = true
    const { base, done } = buildTrailGeoJSON([pr, gr], samples)
    expect(base.features[0]!.properties.itineraryIds.sort()).toEqual([1, 2])
    expect(done.features[0]!.properties.itineraryIds.sort()).toEqual([1, 2])
  })
})

describe('itineraryCoords', () => {
  it('concatène les coordonnées de tous les ways, dans l’ordre', () => {
    const a = straightLine(4.5, LAT, 200, 100)
    const b = straightLine(4.6, LAT, 200, 100)
    const itin = makeItinerary(1, [
      { osmWayId: 10, coords: a },
      { osmWayId: 11, coords: b },
    ])
    expect(itineraryCoords(itin)).toEqual([...a, ...b])
  })

  it('retourne un tableau vide sans ways', () => {
    const itin = makeItinerary(1, [])
    expect(itineraryCoords(itin)).toEqual([])
  })
})

describe('buildTracksGeoJSON', () => {
  it('produit une feature par trace', () => {
    const tracks: Track[] = [
      {
        id: 't1',
        filename: 'a.gpx',
        points: [
          [4.5, LAT],
          [4.51, LAT],
        ],
        date: null,
        importedAt: '2026-01-01T00:00:00Z',
      },
    ]
    const fc = buildTracksGeoJSON(tracks)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]!.geometry.coordinates).toEqual([
      [4.5, LAT],
      [4.51, LAT],
    ])
  })

  it('ignore les traces de moins de 2 points', () => {
    const fc = buildTracksGeoJSON([
      {
        id: 't1',
        filename: 'vide.gpx',
        points: [],
        date: null,
        importedAt: '2026-01-01T00:00:00Z',
      },
    ])
    expect(fc.features).toHaveLength(0)
  })
})

describe('coloration des tronçons parcourus (issue #142)', () => {
  /**
   * Un lacet : on monte plein est sur 100 m, on fait demi-tour, on repart
   * plein est en décalé. L'épingle fait moins que le pas d'échantillonnage —
   * c'est précisément le cas où relier deux échantillons coupe le virage.
   */
  const EST = 0.00089932 // ~100 m à l'équateur
  const LACET: LonLat[] = [
    [0, 0],
    [EST, 0],
    [EST, EST / 4],
    [0, EST / 4],
    [0, EST / 2],
  ]

  const itineraire: Itinerary = {
    osmRelationId: 1,
    ref: 'GR 1',
    name: null,
    network: 'GR',
    ways: [{ osmWayId: 10, coords: LACET }],
    totalMeters: 350,
    fetchedAt: '2026-08-20T00:00:00Z',
  }

  function echantillons(motif: boolean[]): Sample[] {
    return sampleWay(LACET, 100).map((point, i) => ({
      lon: point[0],
      lat: point[1],
      wayId: 10,
      itineraryIds: [1],
      done: motif[i] ?? false,
    }))
  }

  it('épouse le virage au lieu de le couper', () => {
    const tousFaits = echantillons(sampleWay(LACET, 100).map(() => true))
    const { done } = buildTrailGeoJSON([itineraire], tousFaits, 100)
    expect(done.features).toHaveLength(1)
    const portion = done.features[0]?.geometry.coordinates ?? []

    // Les sommets du chemin sont dans la portion. C'est le point du test :
    // relier les échantillons entre eux ne les produit jamais, puisqu'un
    // échantillon tombe où il tombe, jamais sur un sommet.
    const contient = (point: LonLat) =>
      portion.some(
        ([lon, lat]) =>
          Math.abs(lon - point[0]) < 1e-9 && Math.abs(lat - point[1]) < 1e-9,
      )
    expect(contient([EST, 0])).toBe(true)
    expect(contient([EST, EST / 4])).toBe(true)

    // Et la longueur colorée est celle du chemin réellement parcouru
    // (trois échantillons à cent mètres d'intervalle = 200 m de sentier),
    // pas celle des cordes qui coupent l'épingle — 179 m avant ce correctif.
    expect(polylineLengthMeters(portion)).toBeCloseTo(200, 0)
  })

  it('ne colore que ce qui est parcouru', () => {
    const moitie = echantillons([true, true, false, false, false])
    const { done } = buildTrailGeoJSON([itineraire], moitie, 100)
    const portion = done.features[0]?.geometry.coordinates ?? []
    // Deux échantillons consécutifs faits : cent mètres de chemin, pas plus.
    expect(polylineLengthMeters(portion)).toBeCloseTo(100, 0)
  })

  it('ne colore rien quand rien n’est parcouru', () => {
    const rien = echantillons([])
    expect(buildTrailGeoJSON([itineraire], rien, 100).done.features).toEqual([])
  })

  it('coupe la portion à la fin du way plutôt que d’inventer du chemin', () => {
    // Le dernier échantillon peut tomber au-delà de la longueur réelle si le
    // way ne fait pas un multiple entier du pas.
    const tous = echantillons(sampleWay(LACET, 100).map(() => true))
    const { done } = buildTrailGeoJSON([itineraire], tous, 100)
    const portion = done.features[0]?.geometry.coordinates ?? []
    expect(polylineLengthMeters(portion)).toBeLessThanOrEqual(
      polylineLengthMeters(LACET) + 1,
    )
  })
})
