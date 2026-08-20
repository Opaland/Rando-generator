import { describe, expect, it } from 'vitest'
import { margeBassePanneau, type Rect } from '../../src/lib/mapPadding.ts'

const cadre: Rect = { top: 0, bottom: 800, left: 0, right: 400, width: 400 }

function rect(partiel: Partial<Rect>): Rect {
  const base = { top: 0, bottom: 0, left: 0, right: 0, width: 0 }
  return { ...base, ...partiel }
}

describe('margeBassePanneau', () => {
  it('réserve la hauteur d’un panneau qui barre la carte', () => {
    // Disposition téléphone : la fiche occupe toute la largeur, en bas.
    const panneau = rect({ top: 500, bottom: 800, left: 0, right: 400 })
    expect(margeBassePanneau(cadre, panneau)).toBe(300)
  })

  it('ne réserve rien pour un panneau flottant dans un coin', () => {
    // Disposition bureau : 380 px de large sur une carte de 890.
    const large: Rect = { top: 0, bottom: 665, left: 0, right: 890, width: 890 }
    const panneau = rect({ top: 293, bottom: 653, left: 498, right: 878 })
    expect(margeBassePanneau(large, panneau)).toBe(0)
  })

  it('ne compte que la part du panneau posée sur la carte', () => {
    // Un panneau plus haut que la carte : le haut dépasse, il ne gêne pas
    // davantage pour autant.
    const panneau = rect({ top: -200, bottom: 800, left: 0, right: 400 })
    expect(margeBassePanneau(cadre, panneau)).toBe(800)
  })

  it('rend zéro sans panneau, ou sur un cadre dégénéré', () => {
    expect(margeBassePanneau(cadre, null)).toBe(0)
    expect(margeBassePanneau(cadre, undefined)).toBe(0)
    expect(
      margeBassePanneau(rect({}), rect({ top: 0, bottom: 10, right: 10 })),
    ).toBe(0)
  })

  it('ignore un panneau qui ne recouvre pas la carte', () => {
    const ailleurs = rect({ top: 500, bottom: 800, left: 900, right: 1300 })
    expect(margeBassePanneau(cadre, ailleurs)).toBe(0)
  })
})
