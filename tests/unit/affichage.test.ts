import { describe, it, expect } from 'vitest'
import {
  MODES_AFFICHAGE,
  estModeAffichage,
  lireGrosTexte,
  sectionsVisibles,
  etoilesDeSortie,
} from '../../src/core/affichage.ts'

/**
 * Issue #173 — sur quatorze personas, deux échouent totalement en autonomie :
 * un enfant de neuf ans et une femme de soixante-seize ans.
 *
 * Ce n'est pas un défaut de code — le socle technique est bon. C'est un
 * défaut de mode : l'interface n'a qu'un seul registre, celui de
 * l'utilisateur moyen outillé.
 */
describe('modes d’affichage', () => {
  it('propose deux registres, pas deux applications', () => {
    expect(MODES_AFFICHAGE.map((m) => m.id)).toEqual(['complet', 'simple'])
  })

  it('reconnaît un mode valide et refuse le reste', () => {
    expect(estModeAffichage('simple')).toBe(true)
    expect(estModeAffichage('complet')).toBe(true)
    expect(estModeAffichage('enfant')).toBe(false)
    expect(estModeAffichage('')).toBe(false)
    expect(estModeAffichage(42)).toBe(false)
    expect(estModeAffichage(undefined)).toBe(false)
  })

  it('relit le réglage « gros texte » stocké, et retombe sur faux', () => {
    expect(lireGrosTexte(1)).toBe(true)
    expect(lireGrosTexte(0)).toBe(false)
    expect(lireGrosTexte(undefined)).toBe(false)
    // Une valeur écrite par une version future, ou abîmée : pas de gros
    // texte imposé par accident.
    expect(lireGrosTexte('oui')).toBe(false)
  })
})

describe('sectionsVisibles', () => {
  it('le mode complet ne cache rien', () => {
    const toutes = sectionsVisibles('complet')
    expect(toutes.zone).toBe(true)
    expect(toutes.reglages).toBe(true)
    expect(toutes.sauvegarde).toBe(true)
    expect(toutes.objectifs).toBe(true)
    expect(toutes.historique).toBe(true)
    expect(toutes.itineraires).toBe(true)
    expect(toutes.prochaineSortie).toBe(true)
  })

  it('le mode simple cache, mais laisse de quoi faire la tâche', () => {
    const simple = sectionsVisibles('simple')
    // « Montre où on a marché » suppose de pouvoir charger une zone et
    // déposer une trace : les cacher rendrait le mode inutilisable.
    expect(simple.zone).toBe(true)
    expect(simple.traces).toBe(true)
    expect(simple.tableauDeBord).toBe(true)
    // Ce qui suppose du vocabulaire ou un projet disparaît.
    expect(simple.reglages).toBe(false)
    expect(simple.objectifs).toBe(false)
    expect(simple.prochaineSortie).toBe(false)
    expect(simple.itineraires).toBe(false)
    expect(simple.sauvegarde).toBe(false)
  })

  it('n’enlève jamais la carte ni les traces, quel que soit le mode', () => {
    for (const mode of MODES_AFFICHAGE.map((m) => m.id)) {
      const sections = sectionsVisibles(mode)
      expect(sections.traces).toBe(true)
      expect(sections.tableauDeBord).toBe(true)
    }
  })
})

describe('etoilesDeSortie', () => {
  it('donne une étoile dès qu’une sortie a servi à quelque chose', () => {
    // Pas un score, pas un classement : une marque de ce qui a été fait.
    expect(etoilesDeSortie(0)).toBe(0)
    expect(etoilesDeSortie(1)).toBe(1)
    expect(etoilesDeSortie(30)).toBe(1)
  })

  it('monte avec ce qui a été parcouru, et s’arrête à trois', () => {
    expect(etoilesDeSortie(40)).toBe(2)
    expect(etoilesDeSortie(75)).toBe(3)
    expect(etoilesDeSortie(100)).toBe(3)
    expect(etoilesDeSortie(999)).toBe(3)
  })

  it('ne se laisse pas piéger par une valeur absurde', () => {
    expect(etoilesDeSortie(-10)).toBe(0)
    expect(etoilesDeSortie(NaN)).toBe(0)
  })
})
