import { describe, it, expect } from 'vitest'
import {
  APPROACH_HALF_LIFE_KM,
  suggestNextOutings,
} from '../../src/core/nextOuting.ts'
import type { Itinerary, LonLat, Sample } from '../../src/core/types.ts'
import { STEP_METERS } from '../../src/core/types.ts'

function itinerary(id: number, name: string, meters = 10_000): Itinerary {
  return {
    osmRelationId: id,
    ref: name,
    name: null,
    network: 'GR',
    ways: [],
    totalMeters: meters,
    fetchedAt: '2026-08-19T00:00:00Z',
  }
}

/** Suite d'échantillons sur un way, `done` donné motif par motif. */
function samples(
  wayId: number,
  itineraryIds: number[],
  faits: boolean[],
  lon0 = 4.5,
  lat = 45.4,
): Sample[] {
  return faits.map((done, i) => ({
    lon: lon0 + i * 0.001,
    lat,
    wayId,
    itineraryIds,
    done,
  }))
}

describe('suggestNextOutings', () => {
  it('ne propose pas un itinéraire déjà entièrement parcouru', () => {
    const suggestions = suggestNextOutings(
      [itinerary(1, 'GR 7')],
      samples(100, [1], [true, true, true]),
    )
    expect(suggestions).toEqual([])
  })

  it('retient le plus long tronçon non parcouru et son point de départ', () => {
    // Deux trous : un de 2 échantillons, un de 4. C'est le second qui vaut
    // une sortie.
    const faits = [true, false, false, true, false, false, false, false, true]
    const suggestions = suggestNextOutings(
      [itinerary(1, 'GR 7')],
      samples(100, [1], faits),
    )
    expect(suggestions).toHaveLength(1)
    const premiere = suggestions[0]
    expect(premiere?.bestRun.meters).toBe(4 * STEP_METERS)
    expect(premiere?.bestRun.start[0]).toBeCloseTo(4.504, 6)
    // Le reste à parcourir compte tous les trous, pas seulement le plus grand.
    expect(premiere?.remainingMeters).toBe(6 * STEP_METERS)
  })

  it('coupe un tronçon au changement de chemin', () => {
    // Deux ways distincts ne se suivent pas forcément sur le terrain :
    // les recoller donnerait un « tronçon » imaginaire.
    const suggestions = suggestNextOutings(
      [itinerary(1, 'GR 7')],
      [
        ...samples(100, [1], [false, false]),
        ...samples(200, [1], [false, false, false], 4.8),
      ],
    )
    expect(suggestions[0]?.bestRun.meters).toBe(3 * STEP_METERS)
    expect(suggestions[0]?.bestRun.wayId).toBe(200)
  })

  it('à gain égal, le plus proche passe devant', () => {
    const proche = samples(100, [1], [false, false, false], 4.5, 45.4)
    const loin = samples(200, [2], [false, false, false], 5.5, 45.4)
    const suggestions = suggestNextOutings(
      [itinerary(1, 'Proche'), itinerary(2, 'Lointain')],
      [...proche, ...loin],
      { from: [4.5, 45.4] as LonLat },
    )
    expect(suggestions.map((s) => s.itineraryId)).toEqual([1, 2])
    expect(suggestions[0]?.awayMeters).toBeLessThan(200)
  })

  it('sans position connue, classe sur le seul gain', () => {
    const petit = samples(100, [1], [false, false])
    const grand = samples(200, [2], [false, false, false, false], 5.5)
    const suggestions = suggestNextOutings(
      [itinerary(1, 'Petit'), itinerary(2, 'Grand')],
      [...petit, ...grand],
    )
    expect(suggestions.map((s) => s.itineraryId)).toEqual([2, 1])
    expect(suggestions[0]?.awayMeters).toBeNull()
  })

  it('un long tronçon lointain peut battre un court tronçon proche', () => {
    // La proximité pondère, elle ne décide pas seule : sinon on proposerait
    // éternellement les 200 m qui restent au bout de la rue.
    const court = samples(100, [1], [false], 4.5)
    const long = samples(200, [2], Array<boolean>(30).fill(false), 4.6)
    const suggestions = suggestNextOutings(
      [itinerary(1, 'Court'), itinerary(2, 'Long')],
      [...court, ...long],
      { from: [4.5, 45.4] as LonLat },
    )
    expect(suggestions[0]?.itineraryId).toBe(2)
  })

  it('limite le nombre de propositions', () => {
    const tous = [1, 2, 3, 4].flatMap((id) =>
      samples(id * 100, [id], [false, false], 4.5 + id * 0.1),
    )
    const suggestions = suggestNextOutings(
      [1, 2, 3, 4].map((id) => itinerary(id, `GR ${id}`)),
      tous,
      { limit: 2 },
    )
    expect(suggestions).toHaveLength(2)
  })

  it('compte un chemin partagé pour chacun des itinéraires qui l’empruntent', () => {
    const suggestions = suggestNextOutings(
      [itinerary(1, 'GR 7'), itinerary(2, 'PR')],
      samples(100, [1, 2], [false, false]),
    )
    expect(suggestions.map((s) => s.itineraryId).sort()).toEqual([1, 2])
  })

  it('ignore un itinéraire absent de la liste', () => {
    // Les échantillons peuvent survivre à un changement de zone : proposer
    // un itinéraire qu'on ne peut plus afficher n'aiderait personne.
    expect(
      suggestNextOutings([itinerary(1, 'GR 7')], samples(100, [99], [false])),
    ).toEqual([])
  })

  it('gère l’absence d’échantillons', () => {
    expect(suggestNextOutings([itinerary(1, 'GR 7')], [])).toEqual([])
  })

  it('expose une demi-vie d’approche lisible', () => {
    // La pondération est un choix explicite, pas une constante magique
    // enfouie : à cette distance, un gain vaut moitié moins.
    expect(APPROACH_HALF_LIFE_KM).toBeGreaterThan(0)
  })
})
