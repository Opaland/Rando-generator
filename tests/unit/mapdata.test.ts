import { describe, it, expect } from 'vitest'
import {
  buildTrailGeoJSON,
  buildTracksGeoJSON,
  itineraryCoords,
} from '../../src/core/mapdata.ts'
import { buildSamples } from '../../src/core/matching.ts'
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
