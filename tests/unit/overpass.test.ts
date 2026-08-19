import { describe, it, expect, vi } from 'vitest'
import {
  ZONES,
  buildZoneQuery,
  buildRefQuery,
  parseOverpassResponse,
  fetchOverpass,
  OverpassError,
  OVERPASS_MIRRORS,
} from '../../src/core/overpass.ts'
import pilatFixture from '../fixtures/overpass/pilat.json'

const FETCHED_AT = '2026-02-01T12:00:00Z'

describe('buildZoneQuery', () => {
  it('construit une requête admin_level=6 pour le Rhône + Métropole de Lyon', () => {
    const q = buildZoneQuery('rhone')
    expect(q).toContain('[out:json]')
    expect(q).toContain('[timeout:180]')
    expect(q).toContain('"admin_level"="6"')
    expect(q).toContain('"name"="Rhône"')
    expect(q).toContain('"name"="Métropole de Lyon"')
    expect(q).toContain('relation["route"~"^(hiking|foot|walking)$"](area.zone)')
    expect(q).toContain('out geom;')
  })

  it('utilise boundary=protected_area pour le PNR du Pilat', () => {
    const q = buildZoneQuery('pilat')
    expect(q).toContain('"boundary"="protected_area"')
    expect(q).toContain('Pilat')
  })

  it('« Les trois » réunit toutes les zones', () => {
    const q = buildZoneQuery('trois')
    expect(q).toContain('"name"="Rhône"')
    expect(q).toContain('"name"="Loire"')
    expect(q).toContain('Pilat')
  })

  it('rejette une zone inconnue', () => {
    expect(() => buildZoneQuery('atlantide')).toThrow()
  })

  it('les 4 zones prédéfinies sont exposées pour l’UI', () => {
    expect(ZONES.map((z) => z.id)).toEqual(['rhone', 'loire', 'pilat', 'trois'])
  })
})

describe('buildRefQuery', () => {
  it('cherche le ref avec espace optionnel, insensible à la casse', () => {
    const q = buildRefQuery('GR 20')
    expect(q).toContain('"route"~"^(hiking|foot|walking)$"')
    expect(q).toContain('GR ?20')
    expect(q).toContain(',i]')
  })

  it('les requêtes de zone incluent les itinéraires route=foot (cartoguides)', () => {
    // Les boucles départementales/métropolitaines sont souvent route=foot.
    for (const zoneId of ['rhone', 'loire', 'pilat', 'trois']) {
      expect(buildZoneQuery(zoneId)).toContain('foot')
    }
  })

  it('échappe les caractères spéciaux de regex', () => {
    const q = buildRefQuery('GR 20 (Nord)')
    expect(q).toContain('\\\\(Nord\\\\)')
  })
})

describe('parseOverpassResponse', () => {
  const itineraries = parseOverpassResponse(pilatFixture, FETCHED_AT)

  it('retourne les relations exploitables, sans celles dépourvues de géométrie', () => {
    expect(itineraries.map((i) => i.osmRelationId)).toEqual([1001, 1002, 1003])
  })

  it('extrait ref, nom et réseau (tags puis repli sur ref)', () => {
    const [gr, pr, grp] = itineraries
    expect(gr!.ref).toBe('GR 7')
    expect(gr!.network).toBe('GR')
    expect(pr!.ref).toBeNull()
    expect(pr!.name).toBe('Sentier des Crêtes')
    expect(pr!.network).toBe('PR')
    expect(grp!.network).toBe('GRP')
  })

  it('convertit la géométrie en [lon, lat]', () => {
    const gr = itineraries[0]!
    expect(gr.ways[0]!.coords[0]).toEqual([4.5, 45.4])
  })

  it('déduplique les ways répétés dans une même relation', () => {
    const gr = itineraries[0]!
    expect(gr.ways.map((w) => w.osmWayId)).toEqual([100, 101, 200])
  })

  it('ignore les membres nœuds et les ways sans géométrie', () => {
    const gr = itineraries[0]!
    expect(gr.ways.some((w) => w.osmWayId === 999)).toBe(false)
  })

  it('calcule totalMeters en comptant chaque way une fois', () => {
    const gr = itineraries[0]!
    // 3 ways horizontaux de 0.01° de lon à 45.4° ≈ 3 × 780 m.
    expect(gr.totalMeters).toBeGreaterThan(2300)
    expect(gr.totalMeters).toBeLessThan(2400)
  })

  it('horodate les itinéraires avec fetchedAt', () => {
    expect(itineraries[0]!.fetchedAt).toBe(FETCHED_AT)
  })

  it('ignore les éléments qui ne sont pas des relations et les relations sans membres ni tags', () => {
    const res = parseOverpassResponse(
      {
        elements: [
          { type: 'way', id: 1 },
          { type: 'relation', id: 2 },
          {
            type: 'relation',
            id: 3,
            members: [
              {
                type: 'way',
                ref: 30,
                geometry: [
                  { lat: 45.4, lon: 4.5 },
                  { lat: 45.4, lon: 4.51 },
                ],
              },
            ],
          },
        ],
      },
      FETCHED_AT,
    )
    expect(res.map((i) => i.osmRelationId)).toEqual([3])
    expect(res[0]!.ref).toBeNull()
    expect(res[0]!.network).toBe('PR')
  })
})

describe('fetchOverpass', () => {
  const okResponse = () =>
    new Response(JSON.stringify(pilatFixture), { status: 200 })

  it('interroge le premier miroir et parse la réponse', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]![0]).toBe(OVERPASS_MIRRORS[0])
    expect((data as { elements: unknown[] }).elements).toHaveLength(4)
  })

  it('bascule sur le second miroir si le premier échoue (réseau)', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[1]![0]).toBe(OVERPASS_MIRRORS[1])
    expect(data).toBeTruthy()
  })

  it('bascule aussi sur réponse HTTP non-200', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(okResponse())
    await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('lève une OverpassError en français si tous les miroirs échouent', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      OverpassError,
    )
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      /serveurs de données/i,
    )
    expect(fetchFn).toHaveBeenCalledTimes(2 * OVERPASS_MIRRORS.length)
  })

  it('tente le miroir suivant si la réponse n’est pas du JSON Overpass', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>maintenance</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"pas":"overpass"}', { status: 200 }))
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      OverpassError,
    )
    expect(fetchFn).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length)
  })

  it('utilise fetch global et les miroirs par défaut si rien n’est injecté', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse())
    try {
      await fetchOverpass('QUERY')
      expect(spy).toHaveBeenCalledWith(
        OVERPASS_MIRRORS[0],
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('envoie la requête en POST avec le corps data=…', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())
    await fetchOverpass('QUERY', { fetchFn })
    const init = fetchFn.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body as string).toContain('data=')
  })
})
