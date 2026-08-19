import { describe, it, expect } from 'vitest'
import { animatedValue, easeOut } from '../../src/core/animation.ts'

describe('easeOut', () => {
  it('part de zéro et arrive à un', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
  })

  it('avance plus vite au début qu’à la fin', () => {
    expect(easeOut(0.25)).toBeGreaterThan(0.25)
    expect(easeOut(0.9) - easeOut(0.8)).toBeLessThan(
      easeOut(0.2) - easeOut(0.1),
    )
  })

  it('borne les valeurs hors intervalle', () => {
    expect(easeOut(-1)).toBe(0)
    expect(easeOut(2)).toBe(1)
  })
})

describe('animatedValue', () => {
  it('reste au départ à l’instant zéro', () => {
    expect(animatedValue(10, 20, 0, 500)).toBe(10)
  })

  it('atteint la destination à la fin', () => {
    expect(animatedValue(10, 20, 500, 500)).toBe(20)
    expect(animatedValue(10, 20, 900, 500)).toBe(20)
  })

  it('progresse entre les deux', () => {
    const milieu = animatedValue(0, 100, 250, 500)
    expect(milieu).toBeGreaterThan(0)
    expect(milieu).toBeLessThan(100)
  })

  it('affiche la bonne valeur plutôt que de diviser par zéro', () => {
    expect(animatedValue(10, 20, 0, 0)).toBe(20)
    expect(animatedValue(10, 20, 0, -5)).toBe(20)
  })

  it('descend aussi bien qu’il monte', () => {
    // Retirer une trace fait baisser le pourcentage : l'animation doit
    // fonctionner dans les deux sens.
    expect(animatedValue(50, 10, 250, 500)).toBeLessThan(50)
    expect(animatedValue(50, 10, 500, 500)).toBe(10)
  })
})
