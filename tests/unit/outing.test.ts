import { describe, it, expect } from 'vitest'
import {
  MIN_OUTING_METERS,
  outingHighlights,
  outingLabel,
} from '../../src/core/outing.ts'
import type { CompletionResult, Itinerary, Track } from '../../src/core/types.ts'

function itinerary(id: number, ref: string): Itinerary {
  return {
    osmRelationId: id,
    ref,
    name: null,
    network: 'GR',
    ways: [],
    totalMeters: 10_000,
    fetchedAt: '2026-08-20T00:00:00Z',
  }
}

function result(id: number, doneMeters: number): CompletionResult {
  return {
    itineraryId: id,
    doneMeters,
    totalMeters: 10_000,
    pct: (doneMeters / 10_000) * 100,
    computedAt: '2026-08-20T00:00:00Z',
  }
}

function track(date: string | null): Track {
  return {
    id: 't',
    filename: 'sortie.gpx',
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ],
    date,
    importedAt: '2026-08-20T00:00:00Z',
  }
}

describe('outingHighlights', () => {
  const itineraires = [itinerary(1, 'GR 7'), itinerary(2, 'GR 65'), itinerary(3, 'PR 12')]

  it('classe les itinéraires par distance parcourue ce jour-là', () => {
    const faits = outingHighlights(
      [result(1, 4_200), result(2, 8_100), result(3, 1_100)],
      itineraires,
    )
    expect(faits.map((f) => f.name)).toEqual(['GR 65', 'GR 7', 'PR 12'])
    expect(faits[0]?.doneMeters).toBe(8_100)
  })

  it('écarte un simple croisement de sentier', () => {
    // Traverser un GR perpendiculairement en crédite quelques dizaines de
    // mètres : l'annoncer comme « vous avez parcouru le GR 65 » serait faux.
    const faits = outingHighlights(
      [result(1, 4_200), result(2, MIN_OUTING_METERS - 1)],
      itineraires,
    )
    expect(faits.map((f) => f.name)).toEqual(['GR 7'])
  })

  it('ignore un itinéraire qui n’est plus chargé', () => {
    expect(outingHighlights([result(99, 5_000)], itineraires)).toEqual([])
  })

  it('limite la liste pour rester lisible', () => {
    const nombreux = Array.from({ length: 9 }, (_, i) => itinerary(i + 1, `GR ${i + 1}`))
    const faits = outingHighlights(
      nombreux.map((i) => result(i.osmRelationId, 1_000 * (i.osmRelationId + 1))),
      nombreux,
      { limit: 3 },
    )
    expect(faits).toHaveLength(3)
  })

  it('gère une sortie qui n’a rien touché de balisé', () => {
    expect(outingHighlights([], itineraires)).toEqual([])
  })
})

describe('outingLabel', () => {
  it('écrit la date en toutes lettres', () => {
    const texte = outingLabel(track('2024-06-15T08:30:00Z'))
    expect(texte).toMatch(/2024/)
    expect(texte.toLowerCase()).toMatch(/juin/)
  })

  it('le dit franchement quand la trace n’a pas de date', () => {
    expect(outingLabel(track(null))).toMatch(/sans date/i)
    expect(outingLabel(track('n’importe quoi'))).toMatch(/sans date/i)
  })
})
