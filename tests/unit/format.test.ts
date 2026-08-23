import { describe, it, expect } from 'vitest'
import { formatChrono } from '../../src/lib/format.ts'

/**
 * Le chronomètre de l'écran de marche (issue #152, pierre 3).
 *
 * Il tourne sous les yeux de quelqu'un qui marche : ce qui compte est qu'il
 * bouge chaque seconde et qu'il ne promette jamais plus de temps qu'il n'en
 * s'est écoulé.
 */

describe('formatChrono', () => {
  it('reste en minutes et secondes sous une heure', () => {
    expect(formatChrono(0)).toBe('0:00')
    expect(formatChrono(5_000)).toBe('0:05')
    expect(formatChrono(65_000)).toBe('1:05')
    expect(formatChrono(3_599_000)).toBe('59:59')
  })

  it('ajoute les heures dès la première', () => {
    expect(formatChrono(3_600_000)).toBe('1:00:00')
    expect(formatChrono(3_897_000)).toBe('1:04:57')
    expect(formatChrono(36_000_000)).toBe('10:00:00')
  })

  it('tronque au lieu d’arrondir : un chronomètre n’avance pas d’avance', () => {
    expect(formatChrono(1_999)).toBe('0:01')
  })

  it('ne rend jamais de temps négatif', () => {
    expect(formatChrono(-5_000)).toBe('0:00')
  })
})
