import { describe, it, expect } from 'vitest'
import {
  COMPLETION_PCT,
  MILESTONES,
  isCompleted,
  metersToNextMilestone,
  nextMilestone,
  reachedMilestone,
} from '../../src/core/milestones.ts'

describe('jalons', () => {
  it('propose des paliers réguliers jusqu’à 100 %', () => {
    expect(MILESTONES).toEqual([25, 50, 75, 90, 100])
  })

  it('donne le dernier jalon franchi', () => {
    expect(reachedMilestone(0)).toBeNull()
    expect(reachedMilestone(24.9)).toBeNull()
    expect(reachedMilestone(25)).toBe(25)
    expect(reachedMilestone(74.2)).toBe(50)
    expect(reachedMilestone(100)).toBe(100)
  })

  it('donne le jalon suivant, et plus rien une fois au bout', () => {
    expect(nextMilestone(0)).toBe(25)
    expect(nextMilestone(25)).toBe(50)
    expect(nextMilestone(99.9)).toBe(100)
    expect(nextMilestone(100)).toBeNull()
  })

  it('chiffre ce qu’il reste à parcourir avant le prochain jalon', () => {
    // 40 % de 10 km parcourus : il manque 1 km pour atteindre 50 %.
    expect(metersToNextMilestone(40, 10_000)).toBeCloseTo(1_000, 6)
    expect(metersToNextMilestone(100, 10_000)).toBeNull()
  })

  it('ne promet rien sur un itinéraire de longueur inconnue', () => {
    expect(metersToNextMilestone(40, 0)).toBeNull()
  })
})

describe('isCompleted', () => {
  it('considère un itinéraire bouclé à partir du seuil', () => {
    // Règle empruntée à CityStrides : exiger 100 % punit l'utilisateur pour
    // des tronçons impraticables, des déviations ou une géométrie OSM
    // imparfaite. Le seuil est annoncé, jamais présenté comme du 100 %.
    expect(COMPLETION_PCT).toBe(95)
    expect(isCompleted(94.9)).toBe(false)
    expect(isCompleted(95)).toBe(true)
    expect(isCompleted(100)).toBe(true)
  })
})
