import { describe, it, expect } from 'vitest'
import {
  NIVEAUX_TOLERANCE,
  metresDuNiveau,
  niveauDesMetres,
} from '../../src/core/tolerance.ts'
import { MIN_TOLERANCE, MAX_TOLERANCE } from '../../src/store/appStore.ts'

/**
 * Issue #174 — « Précision de suivi GPS en mètres » était un curseur que
 * personne ne sait régler.
 *
 * Ce que ces tests protègent avant tout : les trois crans ne sont pas trois
 * nombres nouveaux. Ce sont le minimum, le défaut et le maximum que le
 * produit livre déjà. Les remplacer par des valeurs choisies au jugé
 * rendrait l'arbitraire invisible au lieu de le réduire.
 */
describe('niveaux de tolérance', () => {
  it('n’invente aucune valeur : les trois crans sont ceux déjà en place', () => {
    expect(metresDuNiveau('precis')).toBe(MIN_TOLERANCE)
    expect(metresDuNiveau('souple')).toBe(MAX_TOLERANCE)
    // Le défaut historique du produit, ni arrondi ni déplacé.
    expect(metresDuNiveau('normal')).toBe(50)
  })

  it('propose exactement trois choix, dans l’ordre du plus exigeant', () => {
    expect(NIVEAUX_TOLERANCE.map((n) => n.id)).toEqual([
      'precis',
      'normal',
      'souple',
    ])
    const metres = NIVEAUX_TOLERANCE.map((n) => n.metres)
    expect([...metres].sort((a, b) => a - b)).toEqual(metres)
  })

  it('dit ce que chaque choix change, en termes de terrain', () => {
    for (const niveau of NIVEAUX_TOLERANCE) {
      expect(niveau.libelle.length).toBeGreaterThan(0)
      // Une phrase, pas une étiquette : « Précis » seul n'apprend rien.
      expect(niveau.explication.length).toBeGreaterThan(30)
    }
  })

  it('retrouve le niveau depuis une valeur en mètres', () => {
    expect(niveauDesMetres(MIN_TOLERANCE)).toBe('precis')
    expect(niveauDesMetres(50)).toBe('normal')
    expect(niveauDesMetres(MAX_TOLERANCE)).toBe('souple')
  })

  it('ne déguise pas une valeur intermédiaire en cran nommé', () => {
    // Une sauvegarde d'avant l'issue #174, ou un réglage fin fait au curseur,
    // vaut 37 m. L'afficher comme « Précis » mentirait sur ce qui est réglé.
    expect(niveauDesMetres(37)).toBeNull()
    expect(niveauDesMetres(75)).toBeNull()
    expect(niveauDesMetres(0)).toBeNull()
  })

  it('couvre tous les niveaux déclarés', () => {
    const ids = NIVEAUX_TOLERANCE.map((n) => n.id)
    for (const id of ids) {
      expect(niveauDesMetres(metresDuNiveau(id))).toBe(id)
    }
  })
})
