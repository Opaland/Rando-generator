import { describe, it, expect } from 'vitest'
import { espacementTropGrand } from '../../src/core/matching.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #148 — une trace espacée de plus d'un kilomètre donne 0 %, en
 * silence. Ce n'est pas une dégradation progressive, c'est une falaise.
 * Mesuré sur un sentier de 7,8 km entièrement parcouru, en faisant varier
 * le seul espacement de la trace :
 *
 *     16 m → 100,0 %    390 m → 96,2 %    780 m → 91,0 %
 *   1,25 km → 0,0 %     1,6 km → 0,0 %    3,9 km → 0,0 %
 *
 * Le chiffre baisse doucement jusqu'à MAX_GAP_METERS, puis tombe d'un coup.
 * L'issue annonçait 100 % à 780 m ; c'est 91 %, la mesure corrige l'issue.
 *
 * Une montre en économie de batterie, un export « smart recording » ou un
 * GPX simplifié tombent dans ce cas. L'utilisateur importe une sortie réelle
 * et complète, lit 0 %, et conclut que l'application est cassée — il a
 * raison de le conclure, puisque rien ne le lui explique.
 */
function ligne(n: number, pasDegres: number): LonLat[] {
  return Array.from({ length: n }, (_, i) => [4.5 + i * pasDegres, 45.4])
}

describe('espacementTropGrand', () => {
  it('se tait sur une trace ordinaire', () => {
    // ~16 m entre points : l'enregistrement normal d'une montre.
    expect(espacementTropGrand(ligne(50, 0.0002))).toBeNull()
  })

  it('se tait juste en dessous de ce que le matching sait relier', () => {
    // ~780 m : mesuré à 91 % crédité — la falaise n'est pas encore là.
    expect(espacementTropGrand(ligne(20, 0.01))).toBeNull()
  })

  it('rend l’espacement médian quand il dépasse', () => {
    // ~1,25 km : le point de bascule mesuré, où tout tombe à 0 %.
    const espacement = espacementTropGrand(ligne(20, 0.016))
    expect(espacement).not.toBeNull()
    expect(espacement!).toBeGreaterThan(1_000)
    expect(espacement!).toBeLessThan(1_500)
  })

  it('juge sur la médiane, pas sur le maximum', () => {
    // Une trace dense avec UNE pause de 5 km — le cas que MAX_GAP protège,
    // et qui n'est pas un enregistrement économe. La médiane reste basse :
    // avertir ici serait un faux positif, et le seuil existe pour ce cas.
    const dense: LonLat[] = [...ligne(40, 0.0002)]
    dense.push([4.5 + 40 * 0.0002 + 0.07, 45.4])
    dense.push(...ligne(40, 0.0002).map(([lon, lat]): LonLat => [lon + 0.08, lat]))
    expect(espacementTropGrand(dense)).toBeNull()
  })

  it('ne dit rien d’une trace trop courte pour avoir un espacement', () => {
    expect(espacementTropGrand([])).toBeNull()
    expect(espacementTropGrand([[4.5, 45.4]])).toBeNull()
  })

  it('ne se laisse pas piéger par deux points très éloignés', () => {
    // Deux points à 50 km : un seul intervalle, la médiane est cet
    // intervalle. C'est bien trop espacé, et il faut le dire.
    const espacement = espacementTropGrand([
      [4.5, 45.4],
      [5.14, 45.4],
    ])
    expect(espacement).not.toBeNull()
    expect(espacement!).toBeGreaterThan(40_000)
  })
})
