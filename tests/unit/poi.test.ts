import { describe, it, expect, vi } from 'vitest'
import {
  buildPoiQuery,
  parsePoiResponse,
  fetchPois,
} from '../../src/core/poi.ts'
import poiFixture from '../fixtures/overpass/poi.json' with { type: 'json' }
import type { LonLat } from '../../src/core/types.ts'

describe('buildPoiQuery', () => {
  it('construit une requête Overpass bornée à la boîte englobante', () => {
    const coords: LonLat[] = [
      [4.5, 45.4],
      [4.53, 45.43],
    ]
    const q = buildPoiQuery(coords)
    expect(q).toContain('[out:json]')
    expect(q).toContain('tourism')
    expect(q).toContain('natural')
    expect(q).toContain('amenity')
    // bbox Overpass : south,west,north,east — avec une marge.
    expect(q).toMatch(/node\[.*\]\(45\.38\d+,4\.48\d+,45\.44\d+,4\.54\d+\)/)
  })

  it('rejette une liste de coordonnées vide', () => {
    expect(() => buildPoiQuery([])).toThrow()
  })
})

describe('parsePoiResponse', () => {
  const pois = parsePoiResponse(poiFixture)

  it('extrait uniquement les nœuds porteurs d’un tag reconnu', () => {
    expect(pois.map((p) => p.id).sort()).toEqual([9001, 9002, 9003, 9004])
  })

  it('classe correctement chaque catégorie', () => {
    const byId = new Map(pois.map((p) => [p.id, p]))
    expect(byId.get(9001)?.kind).toBe('viewpoint')
    expect(byId.get(9002)?.kind).toBe('peak')
    expect(byId.get(9003)?.kind).toBe('hut')
    expect(byId.get(9004)?.kind).toBe('water')
  })

  it('un point d’eau sans nom donne name = null', () => {
    const water = pois.find((p) => p.id === 9004)
    expect(water?.name).toBeNull()
  })

  it('ignore les ways et les nœuds sans tag reconnu', () => {
    expect(pois.some((p) => p.id === 9005)).toBe(false)
    expect(pois.some((p) => p.id === 9100)).toBe(false)
  })
})

describe('fetchPois', () => {
  it('interroge Overpass et retourne les POI parsés', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(poiFixture), { status: 200 }))
    const coords: LonLat[] = [
      [4.5, 45.4],
      [4.53, 45.43],
    ]
    const pois = await fetchPois(coords, { fetchFn })
    expect(pois).toHaveLength(4)
    expect(fetchFn).toHaveBeenCalled()
  })

  it('retourne un tableau vide (jamais une exception) si Overpass échoue', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))
    const coords: LonLat[] = [
      [4.5, 45.4],
      [4.53, 45.43],
    ]
    await expect(fetchPois(coords, { fetchFn })).resolves.toEqual([])
  })
})
