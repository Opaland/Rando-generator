import { describe, it, expect } from 'vitest'
import { AllocateurPerso } from '../../src/core/identifiantsPerso.ts'
import type { Itinerary } from '../../src/core/types.ts'

function perso(id: number, chemins: number[]): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `perso ${id}`,
    network: 'PERSO',
    ways: chemins.map((osmWayId) => ({
      osmWayId,
      coords: [
        [4.5, 45.4],
        [4.51, 45.41],
      ],
    })),
    totalMeters: 1,
    fetchedAt: '2026-10-18T00:00:00.000Z',
  }
}

describe('AllocateurPerso', () => {
  it('commence à −1 quand rien n’est connu', () => {
    const allocateur = new AllocateurPerso()
    expect(allocateur.relation()).toBe(-1)
    expect(allocateur.chemin()).toBe(-1)
  })

  it('repart sous le plus bas de ce qu’il a observé, relations et chemins à part', () => {
    const allocateur = new AllocateurPerso()
    allocateur.observer([perso(-2, [-7, -3]), perso(-5, [-4])])
    expect(allocateur.relation()).toBe(-6)
    expect(allocateur.chemin()).toBe(-8)
  })

  it('ne redonne jamais ce qu’il a déjà donné, même si la liste observée l’ignore encore', () => {
    // Le cœur de #543 : deux actions qui demandent un numéro avant que
    // l'une ait déposé son résultat voient la même liste.
    const allocateur = new AllocateurPerso()
    allocateur.observer([perso(-1, [-1])])
    const a = allocateur.relation()
    allocateur.observer([perso(-1, [-1])])
    const b = allocateur.relation()
    expect(a).toBe(-2)
    expect(b).toBe(-3)
    allocateur.observer([perso(-1, [-1])])
    expect([allocateur.chemin(), allocateur.chemin()]).toEqual([-2, -3])
  })

  it('ignore les numéros positifs : ceux d’OpenStreetMap ne sont pas les siens', () => {
    const allocateur = new AllocateurPerso()
    allocateur.observer([perso(42, [9_000])])
    expect(allocateur.relation()).toBe(-1)
    expect(allocateur.chemin()).toBe(-1)
  })

  it('réserve un numéro libre et refuse un numéro déjà pris ou déjà donné', () => {
    const allocateur = new AllocateurPerso()
    allocateur.observer([perso(-3, [-10])])
    expect(allocateur.reserverRelation(-3)).toBe(false)
    expect(allocateur.reserverRelation(-1)).toBe(true)
    expect(allocateur.reserverRelation(-1)).toBe(false)
    expect(allocateur.reserverChemin(-10)).toBe(false)
    expect(allocateur.reserverChemin(-2)).toBe(true)
    expect(allocateur.reserverChemin(-2)).toBe(false)
    // Un numéro réservé ne sera plus distribué.
    allocateur.reserverRelation(-4)
    expect(allocateur.relation()).toBe(-5)
    const deux = allocateur.chemin()
    expect(deux).toBe(-11)
  })

  it('distribue sous un numéro réservé, même réservé plus bas que tout', () => {
    const allocateur = new AllocateurPerso()
    expect(allocateur.reserverChemin(-50)).toBe(true)
    expect(allocateur.chemin()).toBe(-51)
  })

  it('n’accepte pas de réserver un numéro positif', () => {
    // Un itinéraire perso au numéro positif se confondrait avec une
    // relation OpenStreetMap — la sauvegarde d'une version future, ou abîmée.
    const allocateur = new AllocateurPerso()
    expect(allocateur.reserverRelation(12)).toBe(false)
    expect(allocateur.reserverChemin(0)).toBe(false)
  })
})
