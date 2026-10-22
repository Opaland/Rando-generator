import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

/**
 * La continuité d'un passage, et les totaux qui en sortent.
 *
 * Écrit après la vague de mutation du 18/10 sur `matching.ts`. Les règles
 * de continuité — trois échantillons au moins, un quart confirmé sous
 * 0,4 × la tolérance — n'étaient éprouvées que loin de leurs bornes, et les
 * totaux par réseau sur des chemins qu'aucun itinéraire ne partageait.
 *
 * Tolérance 50 m, donc confirmation 20 m. Les échantillons tombent tous les
 * 100,8 m (mesuré) : un chemin de 400 m en porte quatre, de 500 m cinq.
 */

const M_LON = 78_710 // mètres par degré de longitude, ≈ 45,4°
const M_LAT = 111_320
const LAT = 45.4

const est = (metres: number, nord = 0): LonLat => [4.5 + metres / M_LON, LAT + nord / M_LAT]

function chemin(id: number, longueur: number): TrailWay {
  return { osmWayId: id, coords: [est(0), est(longueur)] }
}

function itineraire(id: number, ways: TrailWay[], network: Itinerary['network'] = 'PR'): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `itinéraire ${String(id)}`,
    network,
    ways,
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

function lancer(itineraires: Itinerary[], trace: LonLat[]) {
  return runMatching(itineraires, trace, {
    toleranceMeters: 50,
    computedAt: '2026-01-01T00:00:00Z',
  })
}

/**
 * Une trace à 30 m au nord du chemin — sous la tolérance, au-dessus de la
 * confirmation — qui plonge à 5 m au droit de l'échantillon `a` mètres.
 */
function longeEtPlongeA(longueur: number, a: number): LonLat[] {
  return [est(-20, 30), est(a - 10, 30), est(a, 5), est(a + 10, 30), est(longueur + 20, 30)]
}

describe('la part confirmée d’un passage, à sa borne', () => {
  it('un passage confirmé sur un quart exactement est crédité', () => {
    // Quatre échantillons, un seul sous 20 m : 1/4, pas moins d'un quart.
    const { results } = lancer([itineraire(1, [chemin(1, 400)])], longeEtPlongeA(400, 201.6))
    expect(results[0]?.pct).toBe(100)
  })

  it('un passage confirmé sur un cinquième ne l’est pas', () => {
    // Cinq échantillons, un seul sous 20 m : 1/5, sous le quart.
    const { results } = lancer([itineraire(1, [chemin(1, 500)])], longeEtPlongeA(500, 201.6))
    expect(results[0]?.pct).toBe(0)
  })
})

describe('un passage se juge sur ses échantillons, pas sur le chemin entier', () => {
  it('quatre échantillons bien suivis sur dix-neuf sont crédités', () => {
    // 4/19 du chemin : sur le chemin entier, la part confirmée tomberait
    // sous le quart et tout serait retiré.
    const { results } = lancer([itineraire(1, [chemin(1, 1900)])], [est(-20), est(320)])
    expect(results[0]?.pct).toBeCloseTo((4 / 19) * 100, 9)
  })

  it('deux échantillons couverts après un non couvert restent trop courts', () => {
    // Les échantillons à 504 et 605 m, pas celui à 403 m (77 m de la trace).
    // Un passage de deux, sous le minimum de trois — même si l'échantillon
    // qui le précède pouvait y être compté par erreur.
    const { results } = lancer([itineraire(1, [chemin(1, 1900)])], [est(480), est(620)])
    expect(results[0]?.pct).toBe(0)
  })
})

describe('les totaux', () => {
  it('ne comptent qu’une fois un chemin qu’une relation cite deux fois', () => {
    // Un aller-retour : OpenStreetMap peut lister le même chemin deux fois
    // dans une relation. Sa longueur ne double pas pour autant.
    const une = lancer([itineraire(1, [chemin(1, 1000)])], [])
    const deux = lancer([itineraire(1, [chemin(1, 1000), chemin(1, 1000)])], [])
    expect(deux.results[0]?.totalMeters).toBe(une.results[0]?.totalMeters)
  })

  it('ne comptent qu’une fois par réseau un chemin que deux itinéraires partagent', () => {
    const seul = lancer([itineraire(1, [chemin(1, 1000)])], [])
    const partage = lancer(
      [itineraire(1, [chemin(1, 1000)]), itineraire(2, [chemin(1, 1000)])],
      [],
    )
    expect(partage.byNetwork.PR.totalMeters).toBe(seul.byNetwork.PR.totalMeters)
    expect(seul.byNetwork.PR.totalMeters).toBeGreaterThan(0)
  })
})

/*
  Les survivants de la vague du 18/10 sur `matching.ts` qui restent — 39 sur
  421 à la seconde vague, contre 91 à la première — et pourquoi chacun
  (§6bis). Ceux du lissage de vitesse sont dans `lissageDeVitesse.test.ts`. Vérifiés en lisant le code ou en mesurant — pas
  supposés.

  Équivalents :
  - `perItinerary.get(…) ?? { done: 0, total: 0 }` vidé, et `if (counts)`
    forcé à vrai : `computeCompletion` crée l'entrée de chaque itinéraire
    avant la boucle, le repli n'est jamais atteint. (Un test « itinéraire
    sans chemin » a été écrit pour lui, et passait avec le mutant : retiré.)
  - `network &&` dans les agrégats : `networkOf` connaît tout itinéraire.
  - `departagerLesPassages` et `leRivalGagnePartout` : `passages.length < 2`,
    `gagnants.size === 0`, `candidats.size === 0`, `candidats !== null` —
    chaque retour anticipé mène au même `false` par la suite de la boucle.
  - `voisin.wayId === wayId` : deux échantillons d'un même chemin sont à
    100 m, au-delà de toute confirmation (40 m à `MAX_TOLERANCE`).
  - `cx − dx` / `cy − dy` et `distance <= best` : boucles symétriques, et un
    minimum reste un minimum.
  - `rayonCellules` sans sa garde `largeurCellule > 0` : `Math.min(cotes, …)`
    borne déjà le rayon pour toute latitude valide.
  - `buildTrackIndex` sans `points.length === 0` : la boucle ne tourne pas.
  - `espacementTropGrand` sans `points.length < 2` : la médiane d'une liste
    vide vaut NaN, et `NaN > MAX_GAP_METERS` est faux — le même `null`.
  - le bloc de coupure vidé : voir `indexDeTrace.test.ts`.

  Bornes d'égalité exacte, sans entrée réaliste qui les atteigne :
  `distance <= toleranceMeters`, `… <= confirmMeters`, `ecart > confirmMeters`,
  `> MAX_GAP_METERS`,
  `> MAX_WALK_SPEED_MPS`, `mediane > MAX_GAP_METERS`. Le départage `<`
  contre `<=` est de la même famille, mais il cache un vrai problème : #547.
*/
