import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * Deux sorties mises bout à bout dont l'horodatage recule (#539, 8e7e8e7).
 *
 * La garde n'était éprouvée que par `matching.perf.test.ts` — un budget de
 * temps, que la configuration de mutation écarte (`vitest.mutation.config.ts`).
 * Aucune vague ne pouvait donc la casser et le voir. Ce test-ci regarde le
 * résultat, pas la durée.
 *
 * Ce qu'il garde : sans `tNext < tA`, le lissage de vitesse au bout de la
 * première sortie balayait la seconde entière — onze kilomètres plus loin,
 * horodatée depuis zéro — et jugeait motorisés les derniers segments d'une
 * marche à 1,3 m/s. Ça, c'est la lecture du code. Ce qui est mesuré : à 80 m
 * entre deux points, 96,7 % au lieu de 100.
 *
 * Ce qu'il ne garde pas, et qu'on dit plutôt que de le taire : la moitié
 * arrière de la garde (`tPrev > tB`). La retirer n'a changé aucun
 * pourcentage, à 80, 120, 160 ou 200 m d'espacement. Pourquoi, ce n'est pas
 * établi ; elle n'est donc pas déclarée équivalente. Sa garde reste le
 * budget de temps.
 */

const ligne = (lat: number, n: number, pasM: number): LonLat[] =>
  Array.from({ length: n }, (_, i): LonLat => [4.5 + (i * pasM) / 78_710, lat])

function itineraire(id: number, coords: LonLat[]): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `itinéraire ${String(id)}`,
    network: 'PR',
    ways: [{ osmWayId: id, coords }],
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

/** Des horodatages de marche à `vitesse` m/s, partant de zéro. */
function marche(points: LonLat[], vitesse: number): number[] {
  const t = [0]
  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1] as LonLat, points[i] as LonLat)
    t.push((t[i - 1] as number) + (d / vitesse) * 1000)
  }
  return t
}

describe('deux sorties concaténées dont la seconde repart de zéro', () => {
  it('créditent chacune leur sentier en entier', () => {
    const premiere = ligne(45.4, 38, 80)
    const seconde = ligne(45.5, 38, 80)
    const { results } = runMatching(
      [itineraire(1, premiere), itineraire(2, seconde)],
      [...premiere, ...seconde],
      {
        toleranceMeters: 25,
        computedAt: '2026-01-01T00:00:00Z',
        trackTimes: [...marche(premiere, 1.3), ...marche(seconde, 1.3)],
      },
    )
    expect(
      results.map((r) => [r.itineraryId, r.pct]),
      'la fin de la première sortie était jugée motorisée : le lissage de' +
        ' vitesse balayait la seconde, horodatée depuis zéro.',
    ).toEqual([
      [1, 100],
      [2, 100],
    ])
  })
})
