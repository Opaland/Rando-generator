import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import { CELL_SIZE_DEG, type Itinerary, type LonLat } from '../../src/core/types.ts'

/**
 * Le départage entre deux sentiers voisins (#151), poussé dans ses bornes.
 *
 * Écrit après la vague de mutation du 18/10 sur `matching.ts` : le
 * départage n'était éprouvé que par un cas, et quatre de ses règles
 * pouvaient changer sans qu'il rougisse — chercher le rival dans la cellule
 * est ou nord, ignorer un rival trop loin pour être confondu, laisser les
 * deux en cas d'égalité, et lire une distance de zéro comme une vraie
 * distance.
 *
 * Les sentiers sont est-ouest, posés de part et d'autre d'une frontière de
 * rangée de la grille quand le cas l'exige. Tolérance 50 m, donc seuil de
 * confirmation 20 m.
 */

const M_LAT = 111_320
const FRONTIERE = 30_270 * CELL_SIZE_DEG // une frontière de rangée, ≈ 45,405°
const LONGUEUR = 900 / 78_710

function sentier(id: number, lat: number): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `sentier ${String(id)}`,
    network: 'PR',
    ways: [
      {
        osmWayId: id,
        coords: [
          [4.5, lat],
          [4.5 + LONGUEUR, lat],
        ],
      },
    ],
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

const parallele = (lat: number): LonLat[] => [
  [4.5, lat],
  [4.5 + LONGUEUR, lat],
]

function pourcentages(itineraires: Itinerary[], trace: LonLat[]): number[] {
  return runMatching(itineraires, trace, {
    toleranceMeters: 50,
    computedAt: '2026-01-01T00:00:00Z',
  }).results.map((r) => r.pct)
}

describe('le départage entre deux sentiers voisins', () => {
  // Sud juste sous la frontière, nord juste au-dessus : 15 m d'écart, et
  // les échantillons du nord rangés dans la rangée voisine.
  const SUD = FRONTIERE - 5 / M_LAT
  const NORD = FRONTIERE + 10 / M_LAT

  it('retire celui qu’on n’a pas pris, même quand le rival est dans la rangée nord', () => {
    // La trace à 2 m du sentier nord, donc à 17 m du sud : sous la
    // confirmation pour les deux, et c'est au départage de trancher.
    // Le gagnant est à 2 m et non à 0 : une distance non nulle, que
    // `?? Infinity` ne doit pas confondre avec une absence.
    const trace = parallele(NORD + 2 / M_LAT)
    expect(pourcentages([sentier(1, SUD), sentier(2, NORD)], trace)).toEqual([0, 100])
  })

  /*
    La trace **exactement** entre les deux (#547). Mesuré le 18/10 : à
    7,49 m de chacun, le sud était retiré à 0 % parce que sa distance
    dépassait celle du nord de 1,9 × 10⁻⁹ m — de l'arrondi, pas de la
    géographie. Tranché par Cédric le 20/10 : une marge **numérique** de
    1 mm, qui efface l'arrondi et rien d'autre. Mesurée sur ses 12 sorties
    réelles, elle ne change aucun verdict.
  */
  it('crédite les deux quand la trace passe à égale distance', () => {
    const trace = parallele((SUD + NORD) / 2)
    expect(pourcentages([sentier(1, SUD), sentier(2, NORD)], trace)).toEqual([100, 100])
  })

  it('et tranche encore pour un centimètre d’avance', () => {
    // La marge efface l'arrondi, pas l'écart : un centimètre est une
    // différence, petite mais réelle, et le plus proche l'emporte.
    const trace = parallele((SUD + NORD) / 2 + 0.01 / M_LAT)
    expect(pourcentages([sentier(1, SUD), sentier(2, NORD)], trace)).toEqual([0, 100])
  })
})

describe('le même départage, le rival dans la colonne est', () => {
  // Deux sentiers nord-sud de part et d'autre d'une frontière de colonne,
  // 15 m d'écart ; la trace à 2 m du sentier est.
  const FRONTIERE_LON = 3001 * CELL_SIZE_DEG
  const M_LON = 78_710
  const nordSud = (id: number, lon: number): Itinerary => ({
    ...sentier(id, 45.4),
    ways: [
      {
        osmWayId: id,
        coords: [
          [lon, 45.4],
          [lon, 45.4 + 900 / M_LAT],
        ],
      },
    ],
  })
  const OUEST = FRONTIERE_LON - 5 / M_LON
  const EST = FRONTIERE_LON + 10 / M_LON

  it('retire celui qu’on n’a pas pris', () => {
    const trace: LonLat[] = [
      [EST + 2 / M_LON, 45.4],
      [EST + 2 / M_LON, 45.4 + 900 / M_LAT],
    ]
    expect(pourcentages([nordSud(1, OUEST), nordSud(2, EST)], trace)).toEqual([0, 100])
  })
})

describe('deux sentiers parcourus, assez loin pour ne pas être confondus', () => {
  it('restent crédités tous les deux', () => {
    /*
      80 m d'écart : la même rangée de la grille, donc chacun voit les
      échantillons de l'autre, mais au-delà de la confirmation (20 m). Le
      premier est longé à 10 m, le second à 0 m. Ce n'est pas une dispute,
      c'est un voisinage — sans la règle de l'écart, le second « gagnait »
      partout sur le premier et le retirait.
    */
    const A = FRONTIERE + 20 / M_LAT
    const B = A + 80 / M_LAT
    const trace = [...parallele(A - 10 / M_LAT), ...parallele(B)]
    expect(pourcentages([sentier(1, A), sentier(2, B)], trace)).toEqual([100, 100])
  })
})
