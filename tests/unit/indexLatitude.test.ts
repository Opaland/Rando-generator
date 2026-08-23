import { describe, it, expect } from 'vitest'
import { runMatching, rayonCellules } from '../../src/core/matching.ts'
import { makeItinerary } from '../fixtures/synthetic.ts'
import { CELL_SIZE_DEG, type LonLat } from '../../src/core/types.ts'

/**
 * Issue #170, second effet — le hachage spatial en haute latitude.
 *
 * Le hachage découpe l'espace en carrés **de degrés**, et la recherche ne
 * regardait que les huit cellules voisines. Or un degré de longitude
 * rétrécit avec la latitude : la cellule fait 118 m de large à 45°, et 17 m
 * à 84°. Au-delà d'une certaine latitude, un passage à portée de tolérance
 * tombe hors des neuf cellules — et n'est pas compté. Le calcul ne plante
 * pas, il devient faux sans le dire.
 *
 * **Mesuré avant correction**, trace nord-sud, passage à 35 m, tolérance
 * 100 m :
 *
 * | latitude | trace sur un bord de cellule | trace au milieu d'une cellule |
 * |---------:|-----------------------------:|------------------------------:|
 * |      80° |                        100 % |                         100 % |
 * |      82° |                        100 % |                     **0 %**   |
 * |      84° |                    **0 %**   |                     **0 %**   |
 *
 * La seconde colonne est le vrai sujet : **la latitude de rupture dépend de
 * l'endroit où la trace tombe dans la grille.** Deux randonnées identiques
 * séparées de 80 m en longitude, l'une créditée et l'autre non, sans que
 * rien ne distingue les deux cas à l'écran.
 */

/** Trace nord-sud : le décalage est alors dans l'axe qui rétrécit. */
function traceNordSud(lon: number, lat: number): LonLat[] {
  return Array.from({ length: 80 }, (_, i) => [lon, lat + i * 0.0009] as LonLat)
}

function pourcentage(lon: number, lat: number, decalageMetres: number): number {
  const trace = traceNordSud(lon, lat)
  const itin = makeItinerary(1, [{ osmWayId: 10, coords: trace }])
  const points: LonLat[] = trace.map(([l, la]) => [
    l + decalageMetres / (111_195 * Math.cos((la * Math.PI) / 180)),
    la,
  ])
  return (
    runMatching([itin], points, {
      toleranceMeters: 100,
      computedAt: '2026-01-01T00:00:00Z',
    }).results[0]?.pct ?? -1
  )
}

describe('rayonCellules', () => {
  /**
   * Le rayon de balayage se **dérive** de la tolérance et de la largeur
   * d'une cellule à cette latitude. Rien n'est posé au jugement ici : c'est
   * le nombre de cellules qu'il faut traverser pour couvrir la tolérance.
   */
  it('reste à une cellule là où une cellule suffit', () => {
    // À 45°, une cellule fait 118 m : elle couvre déjà les 100 m de
    // tolérance maximale. La France métropolitaine ne change donc pas de
    // comportement, et ne paie rien.
    expect(rayonCellules(45, 100)).toBe(1)
    expect(rayonCellules(51, 100)).toBe(1)
    expect(rayonCellules(45, 25)).toBe(1)
  })

  it('s’élargit quand la cellule rétrécit', () => {
    expect(rayonCellules(84, 100)).toBeGreaterThan(1)
    expect(rayonCellules(85, 100)).toBeGreaterThanOrEqual(rayonCellules(84, 100))
  })

  /**
   * `cos(π/2)` vaut 6,1 × 10⁻¹⁷ et non zéro : sans borne, le rayon calculé
   * au pôle atteindrait le million de cellules et la boucle ne rendrait
   * jamais la main. C'est le même piège que dans `corridor.ts`, où il avait
   * fait tourner un test dix minutes.
   */
  it('reste fini au pôle', () => {
    const rayon = rayonCellules(90, 100)
    expect(Number.isFinite(rayon)).toBe(true)
    expect(rayon).toBeLessThanOrEqual(Math.ceil(360 / CELL_SIZE_DEG))
  })
})

describe('un passage à portée est compté, quelle que soit la latitude', () => {
  for (const lat of [45, 60, 80, 82, 84, 85]) {
    it(`à ${String(lat)}°, trace sur un bord de cellule`, () => {
      expect(pourcentage(4.5, lat, 35)).toBe(100)
    })

    it(`à ${String(lat)}°, trace au milieu d’une cellule`, () => {
      expect(pourcentage(4.5 + CELL_SIZE_DEG / 2, lat, 35)).toBe(100)
    })
  }

  /*
    Et ce qui est hors de portée le reste.

    Ce test ne garde **pas** contre un balayage trop large, et il faut le
    dire : forcer le rayon à cinquante cellules le laisse passer, parce que
    la distance réelle est recalculée segment par segment — élargir la
    recherche ne crédite jamais rien de trop loin, cela coûte seulement du
    temps. Une assertion qui ne peut pas échouer pour la raison qu'on lui
    prête n'est pas une assertion (CLAUDE.md §1bis).

    Le garde-fou contre l'élargissement est ailleurs, et il discrimine :
    `rayonCellules(45, 100) === 1` ci-dessus, qui fixe que la France ne
    balaie pas une cellule de plus qu'avant.
  */
  it('ne crédite pas un passage réellement trop loin', () => {
    expect(pourcentage(4.5, 84, 300)).toBe(0)
    expect(pourcentage(4.5, 45, 300)).toBe(0)
  })
})
