import { describe, it, expect } from 'vitest'
import {
  contenuHorsDAtteinte,
  type PositionFeuille,
} from '../../src/core/maquetteOnglets.ts'

/**
 * Mesuré le 24/08 sur 390 × 844, feuille repliée à 52 px : la tabulation
 * traversait **vingt-six** éléments qu'aucun pixel ne montrait — les quinze
 * boutons de zone, les six itinéraires en vedette, deux champs de saisie,
 * deux en-têtes d'accordéon et le lien de pied de page.
 *
 * Ce n'est pas une gêne théorique. On appuie sur Entrée sans savoir sur quoi,
 * et l'un de ces boutons charge un département entier.
 *
 * La règle vit dans le cœur plutôt que dans le composant parce qu'elle est
 * consultée à deux titres — ce qui est peint, et ce qui est atteignable — et
 * qu'une condition consultée à deux endroits se nomme (CLAUDE.md §4).
 */
describe('contenuHorsDAtteinte', () => {
  it('met hors d’atteinte ce que la feuille repliée ne montre pas', () => {
    expect(contenuHorsDAtteinte('repliee', true)).toBe(true)
  })

  it('laisse tout atteignable dès que la feuille s’ouvre', () => {
    expect(contenuHorsDAtteinte('moitie', true)).toBe(false)
    expect(contenuHorsDAtteinte('pleine', true)).toBe(false)
  })

  /**
   * Le point qui décide de la valeur de la règle : **sur grand écran, il n'y
   * a pas de feuille.** La position y garde sa dernière valeur — on peut donc
   * arriver en large avec `repliee` en mémoire, sans que rien ne soit replié.
   *
   * Mettre alors la colonne hors d'atteinte la rendrait inutilisable au
   * clavier alors qu'elle est entièrement visible. Le panneau replié de
   * grand écran, lui, porte `hidden`, qui retire déjà du parcours de
   * tabulation : la règle n'a rien à y faire.
   */
  it('ne touche à rien sur grand écran, où la feuille n’existe pas', () => {
    for (const position of [
      'repliee',
      'moitie',
      'pleine',
    ] as PositionFeuille[]) {
      expect(contenuHorsDAtteinte(position, false)).toBe(false)
    }
  })
})
