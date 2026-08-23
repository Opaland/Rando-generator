import { describe, it, expect } from 'vitest'
import {
  ONGLETS,
  ancreDeLOnglet,
  sectionsDeLOnglet,
} from '../../src/core/maquetteOnglets.ts'

/**
 * La barre d'onglets sur grand écran (demande du 23/08).
 *
 * Elle est désormais visible à toutes les largeurs. Sur téléphone elle
 * **filtre** les sections, comme avant ; sur grand écran le panneau colonne
 * continue de tout montrer, et cliquer un onglet **amène à sa première
 * section**.
 *
 * Filtrer sur grand écran aurait été l'autre lecture, et elle a été essayée :
 * une soixantaine de tests de bout en bout perdaient l'accès aux panneaux,
 * ce qui dit surtout qu'on y cache les trois quarts d'un écran qui a la
 * place de tout montrer. Le point de rupture garde donc un emploi : il ne
 * décide plus de la présence de la barre, seulement du filtrage.
 */

describe('ancreDeLOnglet', () => {
  it('donne un repère pour chacun des quatre onglets', () => {
    for (const { cle } of ONGLETS) {
      expect(ancreDeLOnglet(cle)).toBeTruthy()
    }
  })

  it('vise la première section de l’onglet', () => {
    // « Progression » commence par le tableau de bord, pas par les objectifs.
    expect(sectionsDeLOnglet('progression')[0]).toBe('tableauDeBord')
    expect(ancreDeLOnglet('progression')).toBe('tableau-de-bord')
  })

  it('donne un repère distinct par onglet', () => {
    const ancres = ONGLETS.map((o) => ancreDeLOnglet(o.cle))
    expect(new Set(ancres).size).toBe(ONGLETS.length)
  })

  /**
   * Le repère est un identifiant de section, pas un sélecteur : le composant
   * décide comment l'atteindre. Sans cela, le cœur porterait une
   * connaissance du DOM qu'il n'a pas à avoir.
   */
  it('ne rend pas un sélecteur CSS', () => {
    for (const { cle } of ONGLETS) {
      expect(ancreDeLOnglet(cle)).not.toMatch(/[[\].#]/)
    }
  })
})
