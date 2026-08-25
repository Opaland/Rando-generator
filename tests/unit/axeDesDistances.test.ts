import { describe, it, expect } from 'vitest'
import { itineraryCoords } from '../../src/core/mapdata.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import { bandesDeRevetement } from '../../src/core/revetement.ts'
import { buildStages } from '../../src/core/stages.ts'
import { buildSamples } from '../../src/core/matching.ts'
import { STEP_METERS } from '../../src/core/types.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

/**
 * Issue #303 — un itinéraire, un axe.
 *
 * Trois fonctions produisaient une distance le long d'un itinéraire, et
 * elles n'étaient pas d'accord :
 *
 * - `itineraryCoords` concaténait les ways **dans l'ordre des membres**, et
 *   comptait donc les allers-retours d'une relation désordonnée ;
 * - `chainWays` (les étapes, la qualité de donnée) les **remettait dans
 *   l'ordre de la marche**, quitte à en retourner ;
 * - `totalMeters` additionnait les longueurs, indépendamment de l'ordre.
 *
 * Sur trois tronçons contigus donnés dans le désordre — le cas ordinaire
 * d'une relation OSM — les deux premiers rendaient **10 931 m et 4 685 m**.
 * Le profil altimétrique pouvait donc annoncer 10,9 km là où l'itinéraire en
 * fait 4,7, et « fin d'étape 2 — km 22 » désigner un autre endroit que le
 * km 22 du profil.
 *
 * Ce fichier n'asserte pas un nombre : il asserte que **les axes sont
 * d'accord**. Un nombre recopié aurait vieilli ; un accord, non.
 */

/** ~785 m par pas de 0,01° de longitude à 45,4°. */
const ligne = (depart: number, n: number): LonLat[] =>
  Array.from({ length: n }, (_, i) => [depart + i * 0.01, 45.4] as LonLat)

const way = (id: number, coords: LonLat[]): TrailWay => ({
  osmWayId: id,
  coords,
})

function itineraire(ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: 'test',
    network: 'GR',
    ways,
    totalMeters: ways.reduce((s, w) => s + polylineLengthMeters(w.coords), 0),
    fetchedAt: '2026-01-01T00:00:00Z',
    osmUpdatedAt: null,
  }
}

const a = ligne(4.5, 3) // 4,50 → 4,52
const b = ligne(4.52, 3) // 4,52 → 4,54
const c = ligne(4.54, 3) // 4,54 → 4,56

/** Les trois mêmes tronçons, dans l'ordre de la marche. */
const ordonne = itineraire([way(1, a), way(2, b), way(3, c)])

/**
 * Les trois mêmes tronçons, tels qu'OpenStreetMap les rend souvent : dans
 * un ordre quelconque, et l'un décrit à l'envers.
 */
const desordre = itineraire([way(2, [...b].reverse()), way(3, c), way(1, a)])

describe('l’axe des distances (#303)', () => {
  it('ne dépend pas de l’ordre des membres de la relation', () => {
    const axeOrdonne = polylineLengthMeters(itineraryCoords(ordonne))
    const axeDesordre = polylineLengthMeters(itineraryCoords(desordre))
    expect(axeDesordre).toBeCloseTo(axeOrdonne, 0)
  })

  it('vaut la somme des longueurs quand les tronçons se touchent', () => {
    // Trois tronçons contigus : il n'y a aucun saut à compter, donc l'axe et
    // `totalMeters` doivent tomber sur le même nombre — dans les deux ordres.
    expect(polylineLengthMeters(itineraryCoords(desordre))).toBeCloseTo(
      desordre.totalMeters,
      0,
    )
  })

  it('est le même pour les bandes de terrain', () => {
    const axe = polylineLengthMeters(itineraryCoords(desordre))
    const bandes = bandesDeRevetement(desordre)
    expect(bandes.at(-1)!.fin).toBeCloseTo(axe, 0)
  })

  it('est le même pour les étapes, quel que soit l’ordre des membres', () => {
    /*
      Les étapes se calent sur les **échantillons** — un relevé tous les
      `STEP_METERS` le long de chaque way, remis dans l'ordre de la marche.
      Leur axe n'est donc pas exactement celui du profil, et l'écart n'est
      pas un défaut mais de l'arithmétique : chaque way est échantillonné
      depuis zéro, donc arrondi au pas supérieur, **une fois par way**.

      Mesuré sur soixante tronçons de 1 565 m avec un pas de 50 m : 96 000 m
      contre 93 891, soit 2 109 m — soit exactement les soixante arrondis.
      La borne assertée est donc `nbWays × STEP_METERS`, qui vient de ce
      calcul et non d'un chiffre choisi pour que le test passe (§2).

      Ce que #303 corrige et que ce test garde, c'est l'autre chose : **cet
      écart ne dépend plus de l'ordre des membres.** Avant le chaînage, le
      même itinéraire donné à l'envers déplaçait l'axe du profil de 133 %.

      Reste un écart connu, hors de portée de cette correction : sur une
      relation **trouée**, les étapes ne comptent que les mètres de sentier,
      là où le profil compte aussi la ligne droite qui franchit le trou.
      Trancher lequel des deux a raison change ce qu'est une étape, et le §2
      interdit de le décider au passage d'une autre correction. C'est écrit
      dans #303.
    */
    const NB_WAYS = 60
    const fabriquer = (ordre: 'membres' | 'inverse') => {
      const ways = Array.from({ length: NB_WAYS }, (_, i) =>
        way(i + 1, ligne(4.5 + i * 0.02, 3)),
      )
      return itineraire(ordre === 'membres' ? ways : [...ways].reverse())
    }

    const ecarts: number[] = []
    for (const ordre of ['membres', 'inverse'] as const) {
      const itin = fabriquer(ordre)
      const axe = polylineLengthMeters(itineraryCoords(itin))
      const etapes = buildStages(itin, buildSamples([itin], STEP_METERS))
      expect(etapes.length, `ordre ${ordre}`).toBeGreaterThan(1)
      const ecart = Math.abs(etapes.at(-1)!.endMeters - axe)
      expect(ecart, `ordre ${ordre}`).toBeLessThanOrEqual(NB_WAYS * STEP_METERS)
      ecarts.push(ecart)
    }

    // Le cœur de #303 : l'écart ne dépend pas de l'ordre des membres.
    expect(ecarts[0]).toBeCloseTo(ecarts[1] as number, 0)
  })
})
