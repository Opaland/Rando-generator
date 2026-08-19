import { describe, it, expect } from 'vitest'
import { buildSummary, summaryFilename } from '../../src/core/summary.ts'
import type { CompletionResult, Itinerary, Track } from '../../src/core/types.ts'

function itinerary(id: number, ref: string): Itinerary {
  return {
    osmRelationId: id,
    ref,
    name: null,
    network: 'GR',
    ways: [],
    totalMeters: 10_000,
    fetchedAt: '2026-08-19T00:00:00Z',
  }
}

function result(id: number, pct: number): CompletionResult {
  return {
    itineraryId: id,
    pct,
    doneMeters: (pct / 100) * 10_000,
    totalMeters: 10_000,
    computedAt: '2026-08-19T00:00:00Z',
  }
}

function track(id: string, date: string | null): Track {
  return {
    id,
    filename: `${id}.gpx`,
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ],
    date,
    importedAt: '2026-08-19T00:00:00Z',
  }
}

const global = { doneMeters: 12_000, totalMeters: 30_000, pct: 40 }

describe('buildSummary', () => {
  it('reprend les chiffres globaux', () => {
    const bilan = buildSummary({
      global,
      results: [result(1, 80)],
      itineraries: [itinerary(1, 'GR 7')],
      tracks: [track('a', '2026-06-01T08:00:00Z')],
      zoneLabel: 'PNR du Pilat',
    })
    expect(bilan.pct).toBe(40)
    expect(bilan.doneMeters).toBe(12_000)
    expect(bilan.zoneLabel).toBe('PNR du Pilat')
    expect(bilan.outings).toBe(1)
  })

  it('classe les itinéraires les plus avancés, jamais ceux à zéro', () => {
    // Un itinéraire jamais foulé n'a rien à faire dans un bilan de sortie.
    const bilan = buildSummary({
      global,
      results: [result(1, 80), result(2, 0), result(3, 95)],
      itineraries: [
        itinerary(1, 'GR 7'),
        itinerary(2, 'GR 3'),
        itinerary(3, 'GR 65'),
      ],
      tracks: [],
    })
    expect(bilan.top.map((t) => t.name)).toEqual(['GR 65', 'GR 7'])
    expect(bilan.top[0]?.completed).toBe(true)
    expect(bilan.top[1]?.completed).toBe(false)
  })

  it('limite le classement pour rester lisible', () => {
    const nombreux = Array.from({ length: 12 }, (_, i) => i + 1)
    const bilan = buildSummary({
      global,
      results: nombreux.map((i) => result(i, 90 - i)),
      itineraries: nombreux.map((i) => itinerary(i, `GR ${i}`)),
      tracks: [],
    })
    expect(bilan.top).toHaveLength(5)
  })

  it('résume la période couverte par les sorties datées', () => {
    const bilan = buildSummary({
      global,
      results: [],
      itineraries: [],
      tracks: [
        track('a', '2025-04-10T08:00:00Z'),
        track('b', '2026-06-01T08:00:00Z'),
        track('c', null),
      ],
    })
    expect(bilan.outings).toBe(3)
    expect(bilan.period).toEqual({ from: '2025-04-10', to: '2026-06-01' })
  })

  it('n’invente pas de période sans sortie datée', () => {
    const bilan = buildSummary({
      global,
      results: [],
      itineraries: [],
      tracks: [track('a', null)],
    })
    expect(bilan.period).toBeNull()
  })

  it('ignore un résultat dont l’itinéraire a disparu', () => {
    const bilan = buildSummary({
      global,
      results: [result(99, 50)],
      itineraries: [itinerary(1, 'GR 7')],
      tracks: [],
    })
    expect(bilan.top).toEqual([])
  })
})

describe('summaryFilename', () => {
  it('nomme le fichier par la date du jour', () => {
    expect(summaryFilename('2026-08-19T22:15:00Z')).toBe(
      'bilan-sentiers-2026-08-19.png',
    )
  })

  it('se rabat sur un nom sans date si l’horodatage est illisible', () => {
    expect(summaryFilename('n’importe quoi')).toBe('bilan-sentiers.png')
  })
})
