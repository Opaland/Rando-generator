import { describe, it, expect } from 'vitest'
import {
  detoursParItineraire,
  type DetoursPoi,
} from '../../src/core/poisDeZone.ts'
import type { Itinerary, LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Le budget de l'attribution des POI, sorti de `poisDeZone.test.ts`
 * (issue #475).
 *
 * Même motif que `routing.perf.test.ts` : un chronomètre sous un nom
 * ordinaire échappe à l'exclusion de `vitest.mutation.config.ts`, et un
 * chronomètre n'apprend rien d'un mutant — ses mutants survivent tous, sans
 * que cette survie dise quoi que ce soit.
 *
 * Celui-ci n'était pas le bloqueur : il passe sous instrumentation complète,
 * mesuré. Il déménage parce que la règle le désigne, pas parce qu'il a
 * échoué.
 */
const LAT = 45.4

function itin(id: number, lonDebut: number, lonFin: number): Itinerary {
  const coords: LonLat[] = []
  for (let lon = lonDebut; lon <= lonFin + 1e-9; lon += 0.001) {
    coords.push([Number(lon.toFixed(6)), LAT])
  }
  return {
    osmRelationId: id,
    ref: `GR ${id}`,
    name: null,
    network: 'GR',
    ways: [{ osmWayId: id * 10, coords }],
    totalMeters: 1_000,
    fetchedAt: '2026-08-25T00:00:00Z',
  }
}

function poi(
  id: string,
  kind: PointOfInterest['kind'],
  lon: number,
  lat: number,
): PointOfInterest {
  return {
    id,
    lon,
    lat,
    kind,
    name: null,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

describe('performance — une zone entière, pas une fiche', () => {
  /**
   * L'attribution tourne sur **toute** la zone, dans le fil principal, à
   * chaque changement de filtre. La fiche n'en traitait qu'un à la fois : le
   * coût n'a jamais été mesuré à cette échelle.
   *
   * Deux cents itinéraires de cent points, quatre cents POI — le plafond
   * qu'`out center 400` impose déjà à la requête. Une comparaison naïve
   * ferait 200 × 400 × 100 = huit millions de distances.
   */
  it('200 itinéraires × 400 POI en moins d’une seconde', () => {
    const itineraires = Array.from({ length: 200 }, (_, i) =>
      itin(i + 1, 4.5 + i * 0.02, 4.51 + i * 0.02),
    )
    const pois = Array.from({ length: 400 }, (_, i) =>
      poi(
        `node/${String(i)}`,
        i % 2 === 0 ? 'water' : 'shelter',
        4.5 + i * 0.01,
        LAT + 0.0002,
      ),
    )
    const debut = performance.now()
    const resultats: DetoursPoi[] = detoursParItineraire(itineraires, pois)
    const duree = performance.now() - debut
    expect(resultats).toHaveLength(200)
    expect(duree, `attribution en ${duree.toFixed(0)} ms`).toBeLessThan(1_000)
  })
})
