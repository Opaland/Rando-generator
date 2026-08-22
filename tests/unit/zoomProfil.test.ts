import { describe, it, expect } from 'vitest'
import {
  fenetreEntiere,
  zoomer,
  deplacer,
  suivre,
  estZoome,
  LARGEUR_MIN_METRES,
} from '../../src/core/zoomProfil.ts'

/**
 * Le zoom du profil altimétrique (issue #179).
 *
 * Il ne sert pas qu'au confort : mesuré sur la donnée réelle, le revêtement
 * n'est renseigné que sur un tiers de la longueur, par tronçons épars. Sur
 * un itinéraire de 450 km affiché dans 320 pixels, un tronçon renseigné de
 * 300 m fait moins d'un pixel. Sans zoom, la bande de revêtement est un
 * confetti illisible.
 */
const TOTAL = 10_000

describe('fenetreEntiere', () => {
  it('couvre tout le parcours', () => {
    expect(fenetreEntiere(TOTAL)).toEqual({ debut: 0, fin: TOTAL })
  })
})

describe('zoomer', () => {
  it('resserre autour du point visé', () => {
    // Le point qu'on regarde ne doit pas bouger sous le curseur : c'est ce
    // qui distingue un zoom d'un saut.
    const f = zoomer(fenetreEntiere(TOTAL), TOTAL, 0.5, 5000)
    expect(f.debut).toBeCloseTo(2500, 0)
    expect(f.fin).toBeCloseTo(7500, 0)
  })

  it('garde le point visé fixe même près d’un bord', () => {
    const f = zoomer(fenetreEntiere(TOTAL), TOTAL, 0.5, 0)
    expect(f.debut).toBe(0)
    expect(f.fin).toBeCloseTo(5000, 0)
  })

  it('ne sort jamais du parcours', () => {
    const f = zoomer({ debut: 8000, fin: 10_000 }, TOTAL, 2, 9000)
    expect(f.debut).toBeGreaterThanOrEqual(0)
    expect(f.fin).toBeLessThanOrEqual(TOTAL)
  })

  it('ne descend pas sous une largeur exploitable', () => {
    // En dessous, deux points d'altitude consécutifs sortent du cadre et le
    // graphique n'a plus rien à montrer.
    let f = fenetreEntiere(TOTAL)
    for (let i = 0; i < 40; i += 1) f = zoomer(f, TOTAL, 0.5, 5000)
    expect(f.fin - f.debut).toBeGreaterThanOrEqual(LARGEUR_MIN_METRES)
  })

  it('ne dépasse pas le parcours en dézoomant', () => {
    let f = { debut: 4000, fin: 6000 }
    for (let i = 0; i < 20; i += 1) f = zoomer(f, TOTAL, 2, 5000)
    expect(f).toEqual({ debut: 0, fin: TOTAL })
  })

  it('ne fait rien sur un parcours plus court que la largeur minimale', () => {
    const court = LARGEUR_MIN_METRES / 2
    const f = zoomer(fenetreEntiere(court), court, 0.5, 0)
    expect(f).toEqual({ debut: 0, fin: court })
  })
})

describe('deplacer', () => {
  it('glisse d’une fraction de la fenêtre visible', () => {
    const f = deplacer({ debut: 4000, fin: 6000 }, TOTAL, 0.5)
    expect(f).toEqual({ debut: 5000, fin: 7000 })
  })

  it('bute sur la fin sans se rétrécir', () => {
    // Une fenêtre qui rétrécit en butant changerait le niveau de zoom sans
    // qu'on l'ait demandé.
    const f = deplacer({ debut: 9000, fin: 10_000 }, TOTAL, 1)
    expect(f).toEqual({ debut: 9000, fin: 10_000 })
  })

  it('bute sur le début sans se rétrécir', () => {
    const f = deplacer({ debut: 0, fin: 1000 }, TOTAL, -1)
    expect(f).toEqual({ debut: 0, fin: 1000 })
  })
})

describe('estZoome', () => {
  it('distingue la vue entière d’une vue resserrée', () => {
    expect(estZoome(fenetreEntiere(TOTAL), TOTAL)).toBe(false)
    expect(estZoome({ debut: 0, fin: 5000 }, TOTAL)).toBe(true)
  })
})

/**
 * Trouvaille de la revue du sprint 6.
 *
 * Mesuré sur l'application déployée : fenêtre zoomée sur 0,9–1,5 km, une
 * seule frappe `End` porte le curseur à 2,3 km. La fenêtre ne bougeait pas,
 * et le cercle du curseur était dessiné à `cx = 784` dans un `viewBox` large
 * de 320 — hors cadre, écrêté par le `clipPath`. La lecture sous le
 * graphique et le marqueur sur la carte continuaient d'avancer : on
 * naviguait à l'aveugle.
 *
 * Le commentaire du composant affirmait « le clavier fait la même chose que
 * la souris ». À la souris c'est impossible : le pointeur ne peut pas
 * désigner un point hors du cadre.
 */
describe('suivre', () => {
  const total = 10_000

  it('ne bouge pas une fenêtre qui contient déjà le point', () => {
    const fenetre = { debut: 2000, fin: 4000 }
    expect(suivre(fenetre, total, 3000)).toEqual(fenetre)
    // Les bornes comptent comme contenues : sinon chaque butée glisserait.
    expect(suivre(fenetre, total, 2000)).toEqual(fenetre)
    expect(suivre(fenetre, total, 4000)).toEqual(fenetre)
  })

  it('glisse juste ce qu’il faut pour rattraper un point devant', () => {
    const apres = suivre({ debut: 2000, fin: 4000 }, total, 5000)
    expect(apres.fin).toBe(5000)
    // La largeur ne change pas : suivre n'est pas un zoom.
    expect(apres.fin - apres.debut).toBe(2000)
  })

  it('glisse de même pour un point derrière', () => {
    const apres = suivre({ debut: 2000, fin: 4000 }, total, 500)
    expect(apres.debut).toBe(500)
    expect(apres.fin - apres.debut).toBe(2000)
  })

  it('ne sort jamais du parcours', () => {
    const fin = suivre({ debut: 2000, fin: 4000 }, total, total)
    expect(fin.fin).toBe(total)
    expect(fin.debut).toBe(total - 2000)
    const debut = suivre({ debut: 2000, fin: 4000 }, total, 0)
    expect(debut.debut).toBe(0)
    expect(debut.fin).toBe(2000)
  })

  /**
   * L'invariant qui compte : après `suivre`, le point est visible. C'est la
   * seule chose que le composant demande, et la seule qui manquait.
   */
  it('rend le point visible, d’où qu’il vienne', () => {
    const fenetres = [
      { debut: 0, fin: total },
      { debut: 0, fin: 50 },
      { debut: 4000, fin: 4200 },
      { debut: total - 100, fin: total },
    ]
    for (const fenetre of fenetres) {
      for (const point of [0, 1, 499, 4100, 9999, total]) {
        const apres = suivre(fenetre, total, point)
        expect(apres.debut).toBeLessThanOrEqual(point)
        expect(apres.fin).toBeGreaterThanOrEqual(point)
        expect(apres.fin - apres.debut).toBeCloseTo(fenetre.fin - fenetre.debut, 6)
      }
    }
  })
})

/**
 * Le point est ramené dans le parcours en entrée. Deux butées écrites
 * d'abord sur la fenêtre en sortie étaient inatteignables : une mutation les
 * a supprimées sans faire rougir un seul test.
 */
describe('suivre — un point hors parcours', () => {
  it('est ramené aux extrémités plutôt que d’emporter la fenêtre', () => {
    expect(suivre({ debut: 2000, fin: 4000 }, 10_000, 999_999)).toEqual({
      debut: 8000,
      fin: 10_000,
    })
    expect(suivre({ debut: 2000, fin: 4000 }, 10_000, -50)).toEqual({
      debut: 0,
      fin: 2000,
    })
  })
})
