import { describe, it, expect } from 'vitest'
import { recouvrementAvecTronc } from '../../src/core/variantes.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

function itineraire(
  osmRelationId: number,
  ref: string | null,
  ways: TrailWay[],
): Itinerary {
  return {
    osmRelationId,
    ref,
    name: 'test',
    network: 'GR',
    ways,
    totalMeters: ways.reduce(
      (total, w) => total + polylineLengthMeters(w.coords),
      0,
    ),
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

/** ~785 m par pas de 0,01° de longitude à 45,4° de latitude. */
const way = (osmWayId: number, depart: number): TrailWay => ({
  osmWayId,
  coords: [
    [depart, 45.4],
    [depart + 0.01, 45.4],
  ],
})

describe('recouvrementAvecTronc (#333)', () => {
  it('rend null si la ref ne dérive pas (pas de lettre finale)', () => {
    const gr76 = itineraire(1, 'GR 76', [way(1, 0)])
    expect(recouvrementAvecTronc(gr76, [gr76])).toBeNull()
  })

  it('rend null si la ref est absente', () => {
    const sansRef = itineraire(1, null, [way(1, 0)])
    expect(recouvrementAvecTronc(sansRef, [sansRef])).toBeNull()
  })

  it('rend null si le tronc dérivé n’est pas dans la liste (hors zone)', () => {
    const variante = itineraire(2, 'GR 76A', [way(2, 0)])
    expect(recouvrementAvecTronc(variante, [variante])).toBeNull()
  })

  it('mesure le recouvrement par way partagé, pas par distance estimée', () => {
    const w1 = way(1, 0) // partagé
    const w2 = way(2, 0.01) // propre au tronc
    const w3 = way(3, 0.02) // propre à la variante
    const tronc = itineraire(10, 'GR 76', [w1, w2])
    const variante = itineraire(11, 'GR 76A', [w1, w3])

    const resultat = recouvrementAvecTronc(variante, [tronc, variante])

    expect(resultat).not.toBeNull()
    expect(resultat?.tronc.osmRelationId).toBe(10)
    expect(resultat?.pourcentageDeLaVariante).toBeCloseTo(50, 0)
    expect(resultat?.metresPartages).toBeGreaterThan(0)
  })

  it('rend 0 %, pas null, quand la ref dérive mais qu’aucun way n’est partagé (GR 76A réel)', () => {
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [way(2, 1)])

    const resultat = recouvrementAvecTronc(variante, [tronc, variante])

    expect(resultat).not.toBeNull()
    expect(resultat?.pourcentageDeLaVariante).toBe(0)
  })

  it('ne se prend jamais elle-même pour son tronc', () => {
    // Une ref pathologique qui matcherait la regex sans qu'aucun autre
    // itinéraire ne porte la base : doit rester null, pas se rattacher à soi.
    const seul = itineraire(1, 'GR 7A', [way(1, 0)])
    expect(recouvrementAvecTronc(seul, [seul])).toBeNull()
  })
})
