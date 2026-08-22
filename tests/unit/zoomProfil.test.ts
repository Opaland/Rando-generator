import { describe, it, expect } from 'vitest'
import {
  fenetreEntiere,
  zoomer,
  deplacer,
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
