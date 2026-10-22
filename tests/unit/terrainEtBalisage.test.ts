import { describe, it, expect } from 'vitest'
import {
  bandesDeRevetement,
  familleRevetement,
  libelleRevetement,
  segmentsDeRevetement,
} from '../../src/core/revetement.ts'
import { decrireBalisage, lireBalisage } from '../../src/core/balisage.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

/**
 * Le terrain et le balisage, là où la vague de mutation du 18/10 les a
 * trouvés sans test.
 *
 * `pente.ts` est sorti de la vague sans rien qui compte : ses sept
 * survivants sont des gardes doublées et des bornes qui rendent le même
 * arrondi (voir la fin de ce fichier). Sur `revetement.ts` et `balisage.ts`,
 * hors des tables de traduction, une dizaine changeaient un résultat.
 */

const A: LonLat = [5.7, 45.1]
const B: LonLat = [5.71, 45.1]
const C: LonLat = [5.72, 45.1]
const D: LonLat = [5.73, 45.1]

function itineraire(ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: null,
    name: 'Terrain',
    network: 'PR',
    ways,
    totalMeters: 0,
    fetchedAt: '2026-10-19T00:00:00.000Z',
  }
}

const chemin = (id: number, coords: LonLat[], tags: NonNullable<TrailWay['tags']>): TrailWay => ({
  osmWayId: id,
  coords,
  tags,
})

describe('bandesDeRevetement ne fond pas deux tronçons différents', () => {
  it('quand seul le revêtement diffère, dans la même famille', () => {
    // L'enrobé et le béton sont tous deux « durs » : la famille ne les
    // distingue pas, le revêtement si.
    const bandes = bandesDeRevetement(
      itineraire([chemin(1, [A, B], { surface: 'asphalt' }), chemin(2, [B, C], { surface: 'concrete' })]),
    )
    expect(bandes.map((b) => b.surface)).toEqual(['asphalt', 'concrete'])
  })

  it('quand seule la famille diffère, sans revêtement renseigné', () => {
    // Deux tronçons déduits de leur type de voie, sans `surface` : une rue,
    // dure, puis un sentier, naturel.
    const bandes = bandesDeRevetement(
      itineraire([chemin(1, [A, B], { highway: 'residential' }), chemin(2, [B, C], { highway: 'path' })]),
    )
    expect(bandes.map((b) => b.famille)).toEqual(['dur', 'naturel'])
  })
})

describe('un chemin de longueur nulle', () => {
  // Deux nœuds au même endroit : rien à peindre, et une bande vide « se
  // dessine comme un trait parasite », dit le code.
  const ways = [
    chemin(1, [A, B], { surface: 'asphalt' }),
    chemin(2, [B, B], { surface: 'gravel' }),
    chemin(3, [B, C], { surface: 'asphalt' }),
    chemin(4, [C, D], { surface: 'asphalt' }),
  ]

  it('ne fait pas de bande', () => {
    expect(bandesDeRevetement(itineraire(ways)).map((b) => b.surface)).toEqual(['asphalt'])
  })

  it('ne fait pas de segment de carte', () => {
    expect(segmentsDeRevetement(itineraire(ways)).map((s) => s.surface)).toEqual([
      'asphalt',
      'asphalt',
      'asphalt',
    ])
  })
})

describe('une valeur absente', () => {
  it.each([null, undefined])('est de famille inconnue, et dite « non renseigné » (%s)', (valeur) => {
    // « Autre » voudrait dire « renseigné, mais hors de nos tables » : ce
    // n'est pas la même ignorance.
    expect(familleRevetement(valeur)).toBe('inconnu')
    expect(libelleRevetement(valeur)).toBe('non renseigné')
  })
})

describe('lireBalisage', () => {
  it.each([
    ['sans couleur de voie', ':white:red_bar'],
    ['sans fond ni symbole', 'red::'],
  ])('ne lit rien %s', (_cas, tag) => {
    expect(lireBalisage(tag)).toBeNull()
  })

  it('lit le texte qui suit un second symbole vide', () => {
    // voie:fond:premier:second:texte:couleur — le second plan est vide, le
    // texte vient après.
    expect(lireBalisage('red:white:red_bar::12:black')?.texte).toBe('12')
    expect(decrireBalisage('red:white:red_bar::12:black')).toMatch(/« 12 »/)
  })
})

/*
  Survivants laissés, et pourquoi (§6bis). Vérifiés en lisant le code.

  Les tables de traduction — familles de `revetement.ts` (`sett: 'dur'`…),
  libellés (`gravel: 'gravier'`…), types de voie carrossables, formes de
  `balisage.ts` (`circle: 'cercle'`…). Une quarantaine de survivants, un par
  entrée vidée. Les tester un à un recopierait la table dans le test : la
  skill `vague-mutation` le dit, chasser ces survivants conduit à verrouiller
  des libellés.

  `revetement.ts`
  - `derniere.origine === origine` forcé à vrai : deux tronçons de même
    revêtement ont la même origine — « renseigné » suppose une `surface`,
    « déduit » et « inconnu » n'en ont pas. La garde est redondante, malgré
    le commentaire qui dit qu'elle compte ;
  - `highway !== undefined` forcé : `Set.has(undefined)` est faux ;
  - `if (!w) return []` : `chainWays` ne rend que des chemins de
    l'itinéraire, `parId` les connaît tous ;
  - `coords.length < 2` dans `segmentsDeRevetement` : un point seul a une
    longueur nulle, que la garde suivante écarte ;
  - `longueur <= 0` dans `partsDeRevetement` : ajouter zéro ne change rien.

  `balisage.ts`
  - `champs.length < 2` : un champ seul n'a ni fond ni symbole, et la garde
    `!fond && !premierPlan` le refuse ;
  - `coupure <= 0` : `COULEURS['']` n'existe pas, le symbole est refusé plus
    loin ;
  - `lu.fond === ''` et la phrase « balise » sans fond : `COULEURS['']` rend
    le même `null`, et un fond vide sans symbole ni texte est refusé par
    `lireBalisage` avant d'arriver là.

  `pente.ts`
  - `typeof distance` et `typeof altitude` : la garde suivante,
    `Number.isFinite`, ne convertit pas `null` et l'écarte de même ;
  - la borne de boucle, `longueur > pasLePlusLong` en `>=`, et
    `surMetres < 100` en `<=` — à 100 m, `Math.round(100)` et
    `Math.round(10) × 10` rendent le même nombre.
*/
