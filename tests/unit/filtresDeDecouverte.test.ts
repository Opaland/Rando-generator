import { describe, it, expect } from 'vitest'
import {
  ALL_FILTERS,
  distanceFromMeters,
  estimateMinutes,
  itineraryShape,
  libelleQuestion,
  matchesFilters,
  parseElevationGain,
  parseMinutes,
  toIndex,
  type ItineraryFacts,
} from '../../src/core/discovery.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

/**
 * « Trouver une sortie », là où la vague de mutation du 19/10 l'a trouvé
 * sans test.
 *
 * 95 survivants et 56 lignes jamais exécutées sur `core/discovery.ts`. Les
 * 56 lignes étaient deux fonctions entières que le panneau des filtres
 * appelle à chaque rendu : `libelleQuestion` (« d'après votre phrase : 5 à
 * 10 km ») et `toIndex` (la valeur d'un `<select>`). Le reste : les bornes
 * des filtres, la forme d'un tracé, la proximité d'un long itinéraire, et
 * une durée publiée à 59 minutes.
 */

const FAITS: ItineraryFacts = {
  meters: 10_000,
  gainMeters: 300,
  minutes: 180,
  minutesSource: 'published',
  shape: 'loop',
  awayMeters: 5_000,
  entierementRoulant: false,
}

describe('libelleQuestion', () => {
  it.each([
    [{ minKm: 5, maxKm: 10 }, 'longueur', '5 à 10 km'],
    [{ maxKm: 10 }, 'longueur', 'moins de 10 km'],
    [{ minKm: 20 }, 'longueur', 'plus de 20 km'],
    [{}, 'longueur', null],
    [{ maxMinutes: 90 }, 'duree', 'moins de 90 min'],
    [{}, 'duree', null],
    [{ maxGain: 300 }, 'denivele', 'moins de 300 m'],
    [{}, 'denivele', null],
    [{ maxAwayKm: 25 }, 'proximite', 'à moins de 25 km'],
    [{}, 'proximite', null],
  ] as const)('%o sur « %s » → %s', (pose, champ, attendu) => {
    expect(libelleQuestion(pose, champ)).toBe(attendu)
  })
})

describe('toIndex', () => {
  it.each([
    ['0', 0],
    ['3', 3],
    ['4', 0], // hors de la liste
    ['-1', 0],
    ['1.5', 0],
    ['abc', 0],
  ])('« %s » dans une liste de quatre → %d', (valeur, attendu) => {
    expect(toIndex(valeur, 4)).toBe(attendu)
  })
})

describe('parseMinutes', () => {
  it.each([
    ['1h59', 119],
    ['24 h', 1_440],
    ['1 minute', 1],
  ])('lit « %s »', (texte, minutes) => {
    expect(parseMinutes(texte)).toBe(minutes)
  })

  it.each(['24h01', '1h60', '0 min', ''])('ne lit pas « %s »', (texte) => {
    expect(parseMinutes(texte)).toBeNull()
  })
})

describe('parseElevationGain', () => {
  it.each([
    ['1 200 m', 1_200],
    ['1\u00a0200 m', 1_200],
  ])('lit « %s », espace des milliers compris', (texte, metres) => {
    expect(parseElevationGain(texte)).toBe(metres)
  })
})

describe('estimateMinutes', () => {
  it('rend zéro pour un itinéraire sans longueur, même avec du dénivelé', () => {
    expect(estimateMinutes(0, 300)).toBe(0)
  })
})

describe('matchesFilters, aux bornes', () => {
  // Les bornes sont incluses : « 5 à 10 km » garde un itinéraire de 10 km.
  it.each([
    ['la longueur minimale', { minKm: 10 }],
    ['la longueur maximale', { maxKm: 10 }],
    ['le dénivelé maximal', { maxGain: 300 }],
    ['la durée maximale', { maxMinutes: 180 }],
    ['la distance maximale', { maxAwayKm: 5 }],
  ])('garde un itinéraire pile sur %s', (_cas, filtre) => {
    expect(matchesFilters(FAITS, { ...ALL_FILTERS, ...filtre })).toBe(true)
  })

  it.each([
    ['plus court que le minimum', { minKm: 10.1 }],
    ['plus long que le maximum', { maxKm: 9.9 }],
    ['plus haut que le dénivelé maximal', { maxGain: 299 }],
    ['plus loin que la distance maximale', { maxAwayKm: 4.9 }],
  ])('écarte un itinéraire %s', (_cas, filtre) => {
    expect(matchesFilters(FAITS, { ...ALL_FILTERS, ...filtre })).toBe(false)
  })
})

const A: LonLat = [5.7, 45.1]
const B: LonLat = [5.71, 45.1]
const C: LonLat = [5.72, 45.1]
const D: LonLat = [5.73, 45.1]
const way = (id: number, coords: LonLat[]): TrailWay => ({ osmWayId: id, coords })

describe('itineraryShape', () => {
  it('voit un aller simple en plusieurs tronçons', () => {
    expect(itineraryShape([way(1, [A, B]), way(2, [B, C]), way(3, [C, D])])).toBe('linear')
  })

  it('voit une boucle fermée', () => {
    expect(itineraryShape([way(1, [A, B]), way(2, [B, C]), way(3, [C, A])])).toBe('loop')
  })

  it('voit un aller simple dans une raquette, dont un nœud est vu trois fois', () => {
    // A → B, puis une boucle B → C → B : B est touché trois fois (impair,
    // donc bout libre), A une fois. Deux bouts libres, éloignés : un aller.
    expect(itineraryShape([way(1, [A, B]), way(2, [B, C]), way(3, [C, B])])).toBe('linear')
  })

  it('ne compte pas un tronçon d’un seul point', () => {
    expect(itineraryShape([way(1, [A])])).toBe('unknown')
  })

  it('voit une boucle quand les deux bouts libres se touchent à la tolérance près', () => {
    // A et un point à 100 m de A : sous les 150 m de la tolérance.
    const presDeA: LonLat = [A[0], A[1] + 100 / 111_320]
    expect(itineraryShape([way(1, [A, B]), way(2, [B, C]), way(3, [C, presDeA])])).toBe('loop')
  })
})

describe('distanceFromMeters', () => {
  function itineraire(ways: TrailWay[]): Itinerary {
    return { osmRelationId: 1, ref: null, name: 'x', network: 'PR', ways, totalMeters: 0, fetchedAt: '' }
  }

  it('mesure la distance au plus près d’un long tracé courbe, à travers son éclaircissement', () => {
    /*
      1 000 points sur un demi-cercle de 5 km de rayon : le pas
      d'éclaircissement vaut 5. La personne se tient à 50 m du sommet de
      l'arc. Le tracé est courbe exprès : sur une ligne droite, ne regarder
      que le premier et le dernier point donnerait la même distance, et le
      test ne pourrait pas échouer (vu à l'injection).
    */
    const R = 5_000
    const coords = Array.from({ length: 1_000 }, (_, i): LonLat => {
      const angle = (Math.PI * i) / 999
      return [5.7 + (R * Math.cos(angle)) / 78_710, 45.1 + (R * Math.sin(angle)) / 111_320]
    })
    const ici: LonLat = [5.7, 45.1 + (R + 50) / 111_320]
    const d = distanceFromMeters(itineraire([way(1, coords)]), ici)
    expect(d).toBeGreaterThan(45)
    expect(d).toBeLessThan(60)
  })

  it('tient compte du dernier point d’un tronçon que le pas enjambe', () => {
    // 1 001 points, pas de 6 : le dernier (indice 1 000) n'est pas un
    // multiple du pas, et c'est lui seul qui passe près de la personne.
    const coords = Array.from({ length: 1_001 }, (_, i): LonLat => [5.7 + i * 1e-4, 45.1])
    const auBout: LonLat = [5.7 + 1_000 * 1e-4 + 10 / 78_710, 45.1]
    const d = distanceFromMeters(itineraire([way(1, coords)]), auBout)
    expect(d).toBeLessThan(15)
  })

  it('ne rend rien pour un itinéraire sans point', () => {
    expect(distanceFromMeters(itineraire([]), A)).toBeNull()
  })
})

/*
  Survivants laissés, et pourquoi (§6bis).

  Les tables d'options du panneau — `LONGUEURS`, `DUREES`, `DENIVELES`,
  `PROXIMITES`, `CHAMPS_PILOTES`, `LIBELLE_REGLE_ESTIMATION` — vidées entrée
  par entrée : une cinquantaine de survivants. Les tester recopierait les
  listes dans le test, et la skill `vague-mutation` dit ce que donne la
  chasse à ces survivants-là : des libellés verrouillés.

  Équivalents vérifiés :
  - `toIndex` : `index >= 0` en `> 0` — à zéro, le repli rend aussi 0 ;
  - `parseMinutes` et `parseElevationGain` sans `if (!texte)` : une chaîne
    vide ou `null` ne passe aucune expression régulière ;
  - `\s*m` en `\S*m` dans `parseElevationGain` : il faudrait une unité
    collée à des lettres (« 350 dm ») pour les départager ;
  - `estimateMinutes` : `gainMeters === null ? 0` forcé — `null / 300`
    vaut 0 ;
  - `itineraryShape` : `!debut || !fin` (un tronçon de moins de deux points
    est déjà écarté par la longueur) ; `tronconsUtiles -= 1` (on ne compare
    qu'à zéro) ; `!a || !b` (deux bouts libres existent quand on y arrive) ;
    `<= tolérance` en `<` (égalité exacte de flottants) ;
  - `distanceFromMeters` : `n - longueur` (un total négatif donne un pas de
    1, plus précis, pas moins) ; `Math.max` en `Math.min` (idem) ; les
    gardes `total === 0`, `!point`, `dernier && precedent` et la borne de
    boucle ;
  - `matchesFilters` : `filtre !== null` forcé à vrai — comparer à `null`
    le convertit en 0, et le filtre reste sans effet ;
  - `estEntierementRoulant` : `>=` en `>` sur `1 − 1e-9`.
*/
