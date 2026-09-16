import { describe, it, expect } from 'vitest'
import {
  parseGrNordGeoJSON,
  GR_NORD_RELATION_ID_BASE,
  GR_NORD_WAY_ID_BASE,
  PROVINCE_NORD_ATTRIBUTION,
} from '../../src/core/grNord.ts'
import fixture from '../fixtures/grNord/gr-nord.json'

const FETCHED_AT = '2026-09-16T10:00:00Z'

describe('parseGrNordGeoJSON', () => {
  const stages = parseGrNordGeoJSON(fixture, FETCHED_AT)

  it('convertit chaque étape exploitable en itinéraire GR', () => {
    // La feature à un seul point n'a pas de tracé : écartée.
    expect(stages).toHaveLength(2)
    for (const stage of stages) {
      expect(stage.network).toBe('GR')
      expect(stage.ref).toBeNull()
      expect(stage.fetchedAt).toBe(FETCHED_AT)
    }
  })

  it('porte sa propre attribution, pour ne pas être créditée à OpenStreetMap', () => {
    // network=GR ferait retomber gpxAttributionFor sur OSM_ATTRIBUTION : ce
    // n'est pas d'OSM que vient cette géométrie.
    for (const stage of stages) {
      expect(stage.attribution).toEqual(PROVINCE_NORD_ATTRIBUTION)
    }
  })

  it('attribue des ids hors des plages OSM, boucles locales et imports persos', () => {
    const first = stages[0]!
    expect(first.osmRelationId).toBe(GR_NORD_RELATION_ID_BASE + 1)
    expect(first.ways).toHaveLength(1)
    expect(first.ways[0]!.osmWayId).toBeLessThanOrEqual(GR_NORD_WAY_ID_BASE)
    const allWayIds = stages.flatMap((s) => s.ways.map((w) => w.osmWayId))
    expect(new Set(allWayIds).size).toBe(allWayIds.length)
  })

  it('garde la géométrie telle quelle (une étape = un seul tronçon)', () => {
    const first = stages[0]!
    expect(first.name).toBe('Tchamba St Thomas')
    expect(first.ways[0]!.coords).toEqual([
      [165.24323600017297, -21.003095999742147],
      [165.2432860003974, -21.00308699917427],
      [165.24331699963906, -21.003067999687307],
      [165.24340000027547, -21.003021999194768],
    ])
  })

  it('calcule totalMeters depuis la géométrie', () => {
    // Quatre points sur ~400 m de long à cette latitude : quelques dizaines
    // de mètres, jamais les 9 184 km du champ « longueur » de la source
    // (bogue d'unité du producteur, ignoré comme pour les boucles de Lyon).
    const first = stages[0]!
    expect(first.totalMeters).toBeGreaterThan(0)
    expect(first.totalMeters).toBeLessThan(1_000)
  })

  it('tolère un GeoJSON malformé sans lever (retourne [])', () => {
    expect(parseGrNordGeoJSON(null, FETCHED_AT)).toEqual([])
    expect(parseGrNordGeoJSON({ type: 'FeatureCollection' }, FETCHED_AT)).toEqual([])
    expect(
      parseGrNordGeoJSON(
        { type: 'FeatureCollection', features: [{ type: 'Feature' }] },
        FETCHED_AT,
      ),
    ).toEqual([])
  })

  it('écarte les coordonnées hors bornes WGS84 (données corrompues)', () => {
    const res = parseGrNordGeoJSON(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { objectid: 9, nom: 'Corrompue' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [842000, 6520000],
                [842100, 6520000],
              ],
            },
          },
        ],
      },
      FETCHED_AT,
    )
    expect(res).toEqual([])
  })

  it('écarte une feature sans objectid exploitable', () => {
    const res = parseGrNordGeoJSON(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { nom: 'Sans identifiant' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [165.1, -21.1],
                [165.11, -21.1],
              ],
            },
          },
        ],
      },
      FETCHED_AT,
    )
    expect(res).toEqual([])
  })
})
