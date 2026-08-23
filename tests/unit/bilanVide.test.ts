import { describe, it, expect } from 'vitest'
import { etatDuBilan, libelleSousLeChiffre } from '../../src/core/declaratif.ts'

/**
 * Revue globale du 23/08 — le zéro de Sylvie.
 *
 * Sylvie coche quinze PR depuis leur fiche. Son tableau de bord affichait :
 *
 *     0 %
 *     Aucune sortie importée pour l'instant — 340 km à découvrir.
 *
 * La phrase **contredisait ce qu'elle venait de faire**. Elle était juste la
 * veille : c'est #158 qui l'a rendue fausse sans la toucher, parce qu'elle
 * teste `traces === 0` — et Sylvie n'aura jamais de trace, c'est tout son
 * cas. Le même défaut que #172 avait corrigé pour un autre motif : un zéro
 * nu se lit comme un calcul en panne.
 *
 * La bonne question n'est pas « a-t-elle importé une trace ? » mais
 * **« a-t-elle fait quelque chose ? »**. Elle est nommée ici plutôt que
 * recopiée dans le composant (CLAUDE.md §4).
 */

describe('etatDuBilan', () => {
  it('reconnaît quelqu’un qui n’a encore rien fait', () => {
    expect(etatDuBilan({ traces: 0, declarations: 0 })).toBe('vide')
  })

  it('reconnaît une bibliothèque mesurée', () => {
    expect(etatDuBilan({ traces: 3, declarations: 0 })).toBe('mesure')
  })

  /** Le cas de Sylvie, et la raison d'être de cette fonction. */
  it('reconnaît quelqu’un qui n’a coché que des déclarations', () => {
    expect(etatDuBilan({ traces: 0, declarations: 15 })).toBe('declare')
  })

  /** Dès qu'une trace existe, le chiffre mesuré a un sujet. */
  it('préfère le mesuré dès qu’il y en a', () => {
    expect(etatDuBilan({ traces: 1, declarations: 15 })).toBe('mesure')
  })
})

describe('libelleSousLeChiffre', () => {
  it('dit ce qu’il y a à gagner quand rien n’a été fait', () => {
    expect(
      libelleSousLeChiffre('vide', { doneMeters: 0, totalMeters: 340_000 }),
    ).toBe('Aucune sortie importée pour l’instant — 340 km à découvrir dans cette zone.')
  })

  /**
   * Pour Sylvie, le zéro reste vrai — il est le pourcentage **mesuré**, et
   * #158 interdit de le gonfler. Ce qui change, c'est qu'on cesse de lui
   * dire qu'elle n'a rien fait.
   */
  it('n’affirme plus qu’elle n’a rien fait quand elle a coché', () => {
    const texte = libelleSousLeChiffre('declare', {
      doneMeters: 0,
      totalMeters: 340_000,
    })
    expect(texte).not.toMatch(/Aucune sortie/)
    expect(texte).toMatch(/cochés à la main/)
    expect(texte).toMatch(/trace/)
  })

  it('donne les kilomètres dès qu’il y a de la mesure', () => {
    expect(
      libelleSousLeChiffre('mesure', {
        doneMeters: 12_000,
        totalMeters: 40_000,
      }),
    ).toBe('12 km parcourus · 28 km restants')
  })
})
