import { describe, expect, it } from 'vitest'
import { margeBassePanneau, margeBasseRecouverte, type Rect } from '../../src/lib/mapPadding.ts'

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

  // Trouvé par mutation du 17/10 : aucun test n'atteignait exactement la
  // frontière des 80 % de largeur gênée — tous les cas existants en sont
  // loin, que ce soit en dessous ou largement au-dessus.
  it('ne réserve toujours rien pile à la frontière des 80 %', () => {
    const large: Rect = { top: 0, bottom: 1000, left: 0, right: 1000, width: 1000 }
    const panneau = rect({ top: 700, bottom: 1000, left: 100, right: 900 })
    expect(margeBassePanneau(large, panneau)).toBe(0)
  })
})

/*
  #668, le 11/11 : sans les PDIPR, le crédit de la carte tient déplié au
  téléphone, juste au-dessus de la feuille — et le cadrage de zone, qui ne
  réservait que la feuille, posait le sud du Pilat dessous (mesuré : crédit
  de 345 à 429 px, sud de la zone à 384 px, `cadrage-de-zone.spec.ts`).
*/
describe('margeBasseRecouverte', () => {
  const feuille = rect({ top: 440, bottom: 800, left: 0, right: 400 })

  it('réserve jusqu’au plus haut de ce qui barre le bas de la carte', () => {
    const credit = rect({ top: 345, bottom: 429, left: 10, right: 390 })
    expect(margeBasseRecouverte(cadre, [feuille, credit])).toBe(455)
  })

  it('ne réserve rien de plus pour un crédit replié en « ⓘ »', () => {
    const replie = rect({ top: 405, bottom: 429, left: 366, right: 390 })
    expect(margeBasseRecouverte(cadre, [feuille, replie])).toBe(360)
  })

  it('rend zéro sans rien', () => {
    expect(margeBasseRecouverte(cadre, [null, undefined])).toBe(0)
  })
})

/**
 * Une piste essayée le 24/08, et écartée.
 *
 * Je croyais que le cadrage réservait pour un panneau à moitié rempli — la
 * fiche grandit après son ouverture, le profil et les points d'intérêt
 * arrivant du réseau. J'ai ajouté un paramètre lisant le plafond CSS, et
 * écrit ces tests-ci autour.
 *
 * Aucune injection ne les faisait rougir, pas même en retenant l'altimétrie
 * deux secondes pour fabriquer la fiche lente : sur téléphone le contenu
 * d'entrée dépasse déjà le plafond, atteint dès le premier rendu ; sur grand
 * écran la marge vaut zéro. Le mécanisme ne pouvait pas servir, et il est
 * parti avec ses tests.
 *
 * Le vrai défaut était que la fiche mangeait les deux tiers de la carte.
 * Ce qui reste ici est le souvenir de la piste, pour qu'on ne la reprenne
 * pas en croyant l'inventer.
 */
