import { describe, it, expect } from 'vitest'
import { lienSortant } from '../../src/core/lienSortant.ts'

/**
 * La porte des adresses sortantes (revue globale du 25/08).
 *
 * Chaque cas refusé ici est une façon connue de faire passer un schéma
 * exécutable devant une expression régulière écrite trop vite. Ils sont
 * gardés ensemble parce qu'ils tombent ensemble : c'est le même défaut vu
 * sous six angles, pas six défauts.
 */
describe('lienSortant', () => {
  it('laisse passer http et https', () => {
    expect(lienSortant('https://exemple.fr/a?b=c#d')).toBe(
      'https://exemple.fr/a?b=c#d',
    )
    expect(lienSortant('HTTP://EXEMPLE.FR')).toBe('HTTP://EXEMPLE.FR')
  })

  it('refuse ce qui n\u2019est pas http(s)', () => {
    expect(lienSortant('javascript:alert(1)')).toBeNull()
    expect(lienSortant('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(lienSortant('vbscript:msgbox(1)')).toBeNull()
    expect(lienSortant('file:///etc/passwd')).toBeNull()
  })

  /**
   * Sans l'ancre `^`, celui-ci passe : le motif `https?://` est bien présent,
   * mais **après** le schéma exécutable. Une vague de mutation avait déjà
   * trouvé cette faute exacte ailleurs dans le dépôt.
   */
  it('refuse un http caché derrière un fragment', () => {
    expect(lienSortant('javascript:alert(1)#https://exemple.fr')).toBeNull()
    expect(lienSortant('x-scheme:https://exemple.fr')).toBeNull()
  })

  /**
   * Les navigateurs ignorent blancs et caractères de contrôle dans un `href`.
   * Ces trois-là s'exécutent chez eux, et passent devant une expression
   * régulière qui ne les a pas retirés.
   */
  it('refuse les schémas masqués par des blancs ou des contrôles', () => {
    expect(lienSortant('  javascript:alert(1)')).toBeNull()
    expect(lienSortant('java\tscript:alert(1)')).toBeNull()
    expect(lienSortant('java\nscript:alert(1)')).toBeNull()
    expect(lienSortant('\u0000javascript:alert(1)')).toBeNull()
  })

  it('refuse le vide et l\u2019absence', () => {
    expect(lienSortant(null)).toBeNull()
    expect(lienSortant(undefined)).toBeNull()
    expect(lienSortant('')).toBeNull()
    expect(lienSortant('   ')).toBeNull()
  })

  /**
   * `//exemple.fr` hérite du schéma de la page, donc `https:` ici. Il n'est
   * pas dangereux, mais il n'est pas reconnu non plus : on le refuse plutôt
   * que d'élargir la règle pour un cas absent des données qu'on lit.
   */
  it('refuse une adresse sans schéma', () => {
    expect(lienSortant('//exemple.fr')).toBeNull()
    expect(lienSortant('exemple.fr')).toBeNull()
  })
})
