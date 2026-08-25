import { describe, it, expect, vi } from 'vitest'
import {
  bboxChunks,
  buildPoiQuery,
  parsePoiResponse,
  fetchPois,
} from '../../src/core/poi.ts'
import poiFixture from '../fixtures/overpass/poi.json' with { type: 'json' }
import type { LonLat } from '../../src/core/types.ts'

const COURT: LonLat[] = [
  [4.5, 45.4],
  [4.53, 45.43],
]

describe('bboxChunks', () => {
  it('renvoie une seule boîte pour un tracé court', () => {
    const chunks = bboxChunks(COURT)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.south).toBeCloseTo(45.385, 3)
    expect(chunks[0]!.east).toBeCloseTo(4.545, 3)
  })

  it('découpe un long tracé en portions d’étendue bornée', () => {
    // ~2° de longitude : bien au-delà de l'étendue maximale d'une portion.
    const long: LonLat[] = []
    for (let i = 0; i <= 200; i++) long.push([4.5 + i * 0.01, 45.4])
    const chunks = bboxChunks(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      // Étendue + les deux marges.
      expect(chunk.east - chunk.west).toBeLessThan(0.25 + 0.04)
    }
  })

  it('couvre tout le tracé sans trou entre deux portions', () => {
    const long: LonLat[] = []
    for (let i = 0; i <= 200; i++) long.push([4.5 + i * 0.01, 45.4])
    const chunks = bboxChunks(long)
    for (let i = 1; i < chunks.length; i++) {
      // La portion suivante repart du dernier point de la précédente.
      expect(chunks[i]!.west).toBeLessThan(chunks[i - 1]!.east)
    }
  })

  it('borne le nombre de portions, quitte à élargir les boîtes', () => {
    const enorme: LonLat[] = []
    for (let i = 0; i <= 5000; i++) enorme.push([4.5 + i * 0.01, 45.4])
    expect(bboxChunks(enorme).length).toBeLessThanOrEqual(40)
  })

  it('rejette une liste de coordonnées vide', () => {
    expect(() => bboxChunks([])).toThrow()
  })
})

describe('buildPoiQuery', () => {
  it('interroge nœuds, ways et relations avec un centroïde', () => {
    const q = buildPoiQuery(COURT)
    expect(q).toContain('[out:json]')
    // « nwr » : sans ça, les refuges cartographiés en polygone sont invisibles.
    expect(q).toContain('nwr[')
    // `meta` depuis #285 : sans lui, aucune date de relevé ne revient, et
    // « annoncé ouvert Mo-Sa 08:00-19:00 » reste impossible à peser.
    expect(q).toContain('out meta center')
    expect(q).toMatch(/\(45\.38\d+,4\.48\d+,45\.44\d+,4\.54\d+\)/)
  })

  it('filtre les abris par type dès la requête (pas d’abribus)', () => {
    const q = buildPoiQuery(COURT)
    expect(q).toContain('"amenity"="shelter"')
    expect(q).toContain('basic_hut|lean_to|rock_shelter|weather_shelter')
    expect(q).not.toContain('public_transport')
  })

  it('émet une série de bbox pour un long tracé', () => {
    const long: LonLat[] = []
    for (let i = 0; i <= 200; i++) long.push([4.5 + i * 0.01, 45.4])
    const q = buildPoiQuery(long)
    const bboxCount = (q.match(/nwr\["tourism"/g) ?? []).length
    expect(bboxCount).toBeGreaterThan(1)
  })

  it('rejette une liste de coordonnées vide', () => {
    expect(() => buildPoiQuery([])).toThrow()
  })
})

describe('parsePoiResponse', () => {
  const pois = parsePoiResponse(poiFixture)
  const byId = new Map(pois.map((p) => [p.id, p]))

  it('accepte les surfaces via leur centroïde', () => {
    // Le refuge du Pilat est un polygone de bâtiment : c'est le cas le plus
    // fréquent en montagne, il ne doit pas être perdu.
    const refuge = byId.get('way/9003')
    expect(refuge).toBeDefined()
    expect(refuge?.lat).toBe(45.42)
    expect(refuge?.kind).toBe('hut')
  })

  it('ignore une surface sans centroïde et les éléments sans tag reconnu', () => {
    expect(byId.has('way/9100')).toBe(false)
    expect(byId.has('node/9005')).toBe(false)
  })

  it('distingue refuge gardé, couchage autonome et abri de pause', () => {
    expect(byId.get('way/9003')?.kind).toBe('hut') // alpine_hut, gardé
    expect(byId.get('node/9006')?.kind).toBe('bivouac') // wilderness_hut
    expect(byId.get('node/9007')?.kind).toBe('bivouac') // lean_to
    // Un abri météo n'est pas fait pour dormir (wiki OSM) : autre catégorie.
    expect(byId.get('node/9008')?.kind).toBe('shelter')
  })

  it('écarte les abris hors randonnée (abribus)', () => {
    expect(byId.has('node/9009')).toBe(false)
  })

  it('remonte les informations pratiques taguées', () => {
    const refuge = byId.get('way/9003')
    expect(refuge?.details).toEqual({
      phone: '+33 4 77 00 00 00',
      website: 'https://example.org/refuge-du-pilat',
      capacity: '32',
      openingHours: 'Jun-Sep',
      operator: 'FFCAM',
      elevation: '1350',
      drinkingWater: null,
      seasonal: false,
      spring: false,
      // Ce fixture n'a pas d'horodatage : `null`, jamais la date du jour
      // (issue #285).
      osmUpdatedAt: null,
    })
  })

  it('laisse les informations absentes à null', () => {
    expect(byId.get('node/9004')?.details.phone).toBeNull()
    expect(byId.get('node/9004')?.name).toBeNull()
  })

  it('n’accepte que les sites web http(s)', () => {
    const res = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 45.4,
          lon: 4.5,
          tags: { tourism: 'alpine_hut', website: 'javascript:alert(1)' },
        },
      ],
    })
    expect(res[0]!.details.website).toBeNull()
  })

  it('déduplique un POI renvoyé par deux portions qui se chevauchent', () => {
    const doublon = {
      type: 'node',
      id: 42,
      lat: 45.4,
      lon: 4.5,
      tags: { natural: 'peak', name: 'Sommet' },
    }
    expect(parsePoiResponse({ elements: [doublon, doublon] })).toHaveLength(1)
  })

  it('classe les couchages en tête de liste', () => {
    expect(pois[0]?.kind).toBe('bivouac')
  })

  it('tolère une réponse malformée', () => {
    expect(parsePoiResponse(null)).toEqual([])
    expect(parsePoiResponse({ elements: 'nope' })).toEqual([])
  })
})

describe('fetchPois', () => {
  it('interroge Overpass et retourne les POI parsés', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(poiFixture), { status: 200 }))
    const pois = await fetchPois(COURT, { fetchFn })
    expect(pois.length).toBeGreaterThan(0)
    expect(fetchFn).toHaveBeenCalled()
  })

  it('retourne un tableau vide (jamais une exception) si Overpass échoue', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))
    await expect(fetchPois(COURT, { fetchFn })).resolves.toEqual([])
  })

  it('retourne un tableau vide plutôt que de lever sur un tracé vide', async () => {
    const fetchFn = vi.fn()
    await expect(fetchPois([], { fetchFn })).resolves.toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
