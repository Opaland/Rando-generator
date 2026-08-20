import { describe, it, expect } from 'vitest'
import {
  COMPLETION_PCT,
  MILESTONES,
  crossedMilestones,
  isCompleted,
  metersToNextMilestone,
  nextMilestone,
  reachedMilestone,
} from '../../src/core/milestones.ts'
import type { CompletionResult } from '../../src/core/types.ts'

function result(itineraryId: number, pct: number): CompletionResult {
  return {
    itineraryId,
    pct,
    doneMeters: pct * 100,
    totalMeters: 10_000,
    computedAt: '2026-08-20T00:00:00Z',
  }
}

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

describe('crossedMilestones', () => {
  it('signale un jalon franchi entre deux calculs', () => {
    const franchis = crossedMilestones(new Map([[1, 40]]), [result(1, 60)])
    expect(franchis).toEqual([{ itineraryId: 1, milestone: 50 }])
  })

  it('ne signale que le plus haut jalon quand plusieurs sont franchis d’un coup', () => {
    // Importer une saison entière de traces ne doit pas déclencher quatre
    // annonces pour le même itinéraire.
    const franchis = crossedMilestones(new Map([[1, 10]]), [result(1, 95)])
    expect(franchis).toEqual([{ itineraryId: 1, milestone: 90 }])
  })

  it('ne signale rien au premier calcul', () => {
    // Au chargement d'une zone, tout serait « franchi » — ce serait faux :
    // rien ne vient de se passer, on découvre juste l'état.
    expect(crossedMilestones(new Map(), [result(1, 80)])).toEqual([])
  })

  it('ne signale rien quand le pourcentage baisse', () => {
    // Resserrer la tolérance fait baisser les chiffres : ce n'est pas un
    // franchissement à l'envers, c'est un recalcul.
    expect(crossedMilestones(new Map([[1, 60]]), [result(1, 40)])).toEqual([])
  })

  it('ne signale rien sans changement de jalon', () => {
    expect(crossedMilestones(new Map([[1, 52]]), [result(1, 58)])).toEqual([])
  })

  it('classe les franchissements du plus haut jalon au plus bas', () => {
    const franchis = crossedMilestones(
      new Map([
        [1, 20],
        [2, 80],
      ]),
      [result(1, 30), result(2, 100)],
    )
    expect(franchis.map((f) => f.milestone)).toEqual([100, 25])
  })
})
