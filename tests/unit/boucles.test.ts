import { describe, it, expect } from 'vitest'
import {
  parseBouclesGeoJSON,
  LOCAL_RELATION_ID_BASE,
  LOCAL_WAY_ID_BASE,
} from '../../src/core/boucles.ts'
import fixture from '../fixtures/boucles/metropole.json'

const FETCHED_AT = '2026-08-19T12:00:00Z'

describe('parseBouclesGeoJSON', () => {
  const boucles = parseBouclesGeoJSON(fixture, FETCHED_AT)

  it('convertit chaque boucle exploitable en itinéraire LOCAL', () => {
    // La feature « sans tracé exploitable » (1 seul point) est écartée ;
    // celle sans nom est gardée (nom null, comme les relations OSM sans ref).
    expect(boucles).toHaveLength(3)
    for (const boucle of boucles) {
      expect(boucle.network).toBe('LOCAL')
      expect(boucle.ref).toBeNull()
      expect(boucle.fetchedAt).toBe(FETCHED_AT)
    }
  })

  it('attribue des ids hors des plages OSM et itinéraires persos', () => {
    const first = boucles[0]!
    expect(first.osmRelationId).toBe(LOCAL_RELATION_ID_BASE + 5)
    // Ways : négatifs très loin de la plage des imports persos (-1, -2, …).
    for (const way of first.ways) {
      expect(way.osmWayId).toBeLessThanOrEqual(LOCAL_WAY_ID_BASE)
    }
    // Unicité globale des way ids entre toutes les boucles.
    const allWayIds = boucles.flatMap((b) => b.ways.map((w) => w.osmWayId))
    expect(new Set(allWayIds).size).toBe(allWayIds.length)
  })

  it('découpe un MultiLineString en un way par ligne (lignes d’un seul point ignorées)', () => {
    const first = boucles[0]!
    expect(first.ways).toHaveLength(2)
    expect(first.ways[0]!.coords).toEqual([
      [4.75355, 45.80601],
      [4.75452, 45.80601],
      [4.75549, 45.80601],
    ])
  })

  it('calcule totalMeters depuis la géométrie (pas depuis le champ longueur)', () => {
    const first = boucles[0]!
    // Deux segments de ~75 m + un de ~78 m ≈ 230 m — jamais les 10,2 km du
    // champ « longueur » (chaîne française non fiable : virgule, espace).
    expect(first.totalMeters).toBeGreaterThan(180)
    expect(first.totalMeters).toBeLessThan(300)
  })

  it('remplit les métadonnées éditoriales, null quand la donnée manque', () => {
    const [full, minimal] = boucles
    expect(full!.name).toBe('Les Vallons de la Beffe')
    expect(full!.details).toEqual({
      source: 'Métropole de Lyon',
      commune: 'Dardilly',
      difficulte: 'moyen',
      temps: '2h40',
      denivele: '140 m',
      descriptif: 'Cette balade permet de découvrir deux vallons.',
      lienWeb: 'https://www.grandlyon.com/sentier/exemple-129',
    })
    expect(minimal!.name).toBe('Tour du Fort')
    expect(minimal!.details).toEqual({
      source: 'Métropole de Lyon',
      commune: 'Sathonay-Village',
      difficulte: null,
      temps: null,
      denivele: null,
      descriptif: null,
      lienWeb: null,
    })
  })

  it('n’accepte que les liens web http(s)', () => {
    const res = parseBouclesGeoJSON(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { gid: 1, nom: 'X', lien_web: 'javascript:alert(1)' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [4.9, 45.9],
                  [4.91, 45.9],
                ],
              ],
            },
          },
        ],
      },
      FETCHED_AT,
    )
    expect(res[0]!.details?.lienWeb).toBeNull()
  })

  it('tolère un GeoJSON malformé sans lever (retourne [])', () => {
    expect(parseBouclesGeoJSON(null, FETCHED_AT)).toEqual([])
    expect(parseBouclesGeoJSON({ type: 'FeatureCollection' }, FETCHED_AT)).toEqual([])
    expect(
      parseBouclesGeoJSON(
        { type: 'FeatureCollection', features: [{ type: 'Feature' }] },
        FETCHED_AT,
      ),
    ).toEqual([])
  })

  it('écarte les coordonnées hors bornes (données corrompues)', () => {
    const res = parseBouclesGeoJSON(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { gid: 2, nom: 'Corrompue' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [842000, 6520000],
                  [842100, 6520000],
                ],
              ],
            },
          },
        ],
      },
      FETCHED_AT,
    )
    // Des coordonnées Lambert 93 non reprojetées ne doivent jamais passer.
    expect(res).toEqual([])
  })
})
