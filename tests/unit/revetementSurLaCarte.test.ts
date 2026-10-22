import { describe, it, expect } from 'vitest'
import { revetementToGeoJSON } from '../../src/components/map/style.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

/**
 * `revetementToGeoJSON` assemble ce que `useMapSources.ts` écrit sur la
 * source `trails-revetement` — `segmentsDeRevetement` (testé pour lui-même
 * dans `terrainSurLaCarte.test.ts`) n'était jusqu'ici jamais passé par cette
 * fonction : zéro mutant couvert malgré un usage réel (18/10).
 */
function way(id: number, coords: [number, number][], tags?: Record<string, string>): TrailWay {
  return { osmWayId: id, coords, ...(tags ? { tags } : {}) }
}

function itineraire(ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways,
    totalMeters: 1000,
    fetchedAt: '2026-08-24T00:00:00Z',
  } as unknown as Itinerary
}

describe('revetementToGeoJSON', () => {
  it('rend une entité par tronçon coloré, avec sa géométrie', () => {
    const collection = revetementToGeoJSON([
      itineraire([way(10, [[4.5, 45.4], [4.51, 45.4]], { surface: 'asphalt' })]),
    ])
    expect(collection.features).toHaveLength(1)
    const [feature] = collection.features
    expect(feature?.type).toBe('Feature')
    expect(feature?.geometry).toEqual({
      type: 'LineString',
      coordinates: [[4.5, 45.4], [4.51, 45.4]],
    })
    expect(feature?.properties?.['famille']).toBe('dur')
    expect(feature?.properties?.['origine']).toBe('renseigne')
  })

  it('écarte les tronçons « inconnu », qui n’ont pas de couleur à peindre', () => {
    // `TERRAIN_COLORS.inconnu` est `null` : les peindre ferait passer
    // l’ignorance pour une valeur.
    const collection = revetementToGeoJSON([
      itineraire([way(10, [[4.5, 45.4], [4.51, 45.4]])]),
    ])
    expect(collection.features).toHaveLength(0)
  })

  it('porte un tiret à la famille « autre », jamais aux autres', () => {
    const collection = revetementToGeoJSON([
      itineraire([
        way(10, [[4.5, 45.4], [4.51, 45.4]], { surface: 'ice' }),
        way(11, [[4.51, 45.4], [4.52, 45.4]], { surface: 'asphalt' }),
      ]),
    ])
    const autre = collection.features.find((f) => f.properties?.['famille'] === 'autre')
    const dur = collection.features.find((f) => f.properties?.['famille'] === 'dur')
    expect(autre?.properties?.['tirets']).toBe(true)
    expect(dur?.properties?.['tirets']).toBe(false)
  })

  it('accumule les tronçons de plusieurs itinéraires', () => {
    const collection = revetementToGeoJSON([
      itineraire([way(10, [[4.5, 45.4], [4.51, 45.4]], { surface: 'asphalt' })]),
      itineraire([way(20, [[5.5, 46.4], [5.51, 46.4]], { surface: 'gravel' })]),
    ])
    expect(collection.features).toHaveLength(2)
  })

  it('rend une collection vide sans itinéraire', () => {
    expect(revetementToGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] })
  })
})
