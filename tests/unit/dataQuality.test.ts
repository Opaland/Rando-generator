import { describe, it, expect } from 'vitest'
import {
  STALE_DAYS,
  assessItinerary,
  hasGaps,
} from '../../src/core/dataQuality.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

const LAT = 45.4

function way(id: number, from: number, to: number): TrailWay {
  const coords: LonLat[] = [
    [4.5 + from / 78, LAT],
    [4.5 + to / 78, LAT],
  ]
  return { osmWayId: id, coords }
}

function itinerary(ways: TrailWay[], patch: Partial<Itinerary> = {}): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways,
    totalMeters: 20_000,
    fetchedAt: '2026-08-20T00:00:00Z',
    ...patch,
  }
}

const MAINTENANT = '2026-08-20T12:00:00Z'

describe('assessItinerary', () => {
  it('ne signale rien sur une relation continue et fraîche', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 10, 20)]),
      MAINTENANT,
    )
    expect(bilan.pieces).toBe(1)
    expect(bilan.gaps).toEqual([])
    expect(bilan.warnings).toEqual([])
  })

  it('compte les morceaux et mesure les interruptions', () => {
    // Deux tronçons séparés de 10 km : la relation est trouée dans OSM, et le
    // pourcentage ne porte que sur ce qui est présent.
    const bilan = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 20, 30)]),
      MAINTENANT,
    )
    expect(bilan.pieces).toBe(2)
    expect(bilan.gaps).toHaveLength(1)
    expect(bilan.gapMeters).toBeGreaterThan(9_000)
    expect(bilan.gapMeters).toBeLessThan(11_000)
    expect(bilan.warnings.join()).toMatch(/2 morceaux/)
  })

  it('classe les interruptions de la plus grande à la plus petite', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 5), way(2, 10, 15), way(3, 40, 45)]),
      MAINTENANT,
    )
    expect(bilan.gaps).toHaveLength(2)
    expect(bilan.gaps[0]?.meters).toBeGreaterThan(bilan.gaps[1]?.meters ?? 0)
  })

  it('signale des données anciennes', () => {
    const vieux = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: '2026-06-01T00:00:00Z' }),
      MAINTENANT,
    )
    expect(vieux.ageDays).toBeGreaterThan(STALE_DAYS)
    expect(vieux.warnings.join()).toMatch(/téléchargé/i)
  })

  it('ne signale pas un âge qu’il ne connaît pas', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: 'pas une date' }),
      MAINTENANT,
    )
    expect(bilan.ageDays).toBeNull()
    expect(bilan.warnings.join()).not.toMatch(/téléchargé/i)
  })

  it('signale une relation sans géométrie exploitable', () => {
    const vide = assessItinerary(itinerary([]), MAINTENANT)
    expect(vide.pieces).toBe(0)
    expect(vide.warnings.join()).toMatch(/aucun tracé/i)
  })

  it('ne retient que les trous de géométrie pour la liste', () => {
    // L'âge de la donnée concerne toute la zone d'un coup : répété sur chaque
    // ligne de la liste, il n'apprendrait rien.
    const vieuxMaisContinu = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: '2026-06-01T00:00:00Z' }),
      MAINTENANT,
    )
    expect(vieuxMaisContinu.warnings).not.toEqual([])
    expect(hasGaps(vieuxMaisContinu)).toBe(false)

    const troue = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 20, 30)]),
      MAINTENANT,
    )
    expect(hasGaps(troue)).toBe(true)
  })

  it('ne compte pas un chemin fermé comme une interruption', () => {
    // Une boucle : le dernier tronçon revient sur le premier point.
    const carre: TrailWay = {
      osmWayId: 9,
      coords: [
        [4.5, LAT],
        [4.51, LAT],
        [4.51, LAT + 0.01],
        [4.5, LAT],
      ],
    }
    const bilan = assessItinerary(itinerary([carre]), MAINTENANT)
    expect(bilan.pieces).toBe(1)
    expect(bilan.warnings).toEqual([])
  })
})
