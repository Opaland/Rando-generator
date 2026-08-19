import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import {
  straightLine,
  shiftNorth,
  makeItinerary,
  metersToDegLon,
} from '../fixtures/synthetic.ts'
import type { LonLat } from '../../src/core/types.ts'

const LAT = 45.4
const NOW = '2026-02-01T12:00:00Z'

function opts(toleranceMeters = 50) {
  return { toleranceMeters, stepMeters: 100, computedAt: NOW }
}

describe('runMatching — fixtures de matching', () => {
  it('trace exactement superposée au tracé → 100 %', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results } = runMatching([itin], line, opts())
    expect(results).toHaveLength(1)
    expect(results[0]!.pct).toBe(100)
    expect(results[0]!.doneMeters).toBe(results[0]!.totalMeters)
    expect(results[0]!.computedAt).toBe(NOW)
  })

  it('trace décalée de 30 m → 0 % à TOL = 50 (chemin parallèle)', () => {
    // Comportement délibérément inversé : cette fixture créditait autrefois
    // 100 %, alors qu'un écart de 30 m qui ne se referme jamais décrit une
    // route qui longe le sentier, pas une marche dessus. C'était le faux
    // positif principal du moteur — cf. docs/PRODUCT_AUDIT.md (P0-1) et
    // tests/unit/matchingQuality.test.ts.
    const line = straightLine(4.5, LAT, 1000, 100)
    const trace = shiftNorth(straightLine(4.5, LAT, 1000, 10), 30)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results } = runMatching([itin], trace, opts(50))
    expect(results[0]!.pct).toBe(0)
  })

  it('trace décalée de 12 m → 100 % à TOL = 50 (bruit GPS ordinaire)', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const trace = shiftNorth(straightLine(4.5, LAT, 1000, 10), 12)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results } = runMatching([itin], trace, opts(50))
    expect(results[0]!.pct).toBe(100)
  })

  it('trace décalée de 70 m → 0 % à TOL = 50', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const trace = shiftNorth(straightLine(4.5, LAT, 1000, 10), 70)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results } = runMatching([itin], trace, opts(50))
    expect(results[0]!.pct).toBe(0)
    expect(results[0]!.doneMeters).toBe(0)
  })

  it('trace couvrant la moitié du tracé → 50 % ± 2 points', () => {
    const line = straightLine(4.5, LAT, 10_000, 100)
    const trace = straightLine(4.5, LAT, 5_000, 100)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results } = runMatching([itin], trace, opts())
    expect(results[0]!.pct).toBeGreaterThan(48)
    expect(results[0]!.pct).toBeLessThan(52)
  })

  it('trace vide → 0 % partout, sans erreur', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])
    const { results, global } = runMatching([itin], [], opts())
    expect(results[0]!.pct).toBe(0)
    expect(global.doneMeters).toBe(0)
  })

  it('way de 2 points et way plus court que STEP sont gérés', () => {
    const shortWay: LonLat[] = [
      [4.5, LAT],
      [4.5 + metersToDegLon(40, LAT), LAT],
    ]
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: shortWay }])
    // Trace passant sur le way : l'unique échantillon est fait → 100 %.
    const { results } = runMatching([itin], [[4.5, LAT]], opts())
    expect(results[0]!.pct).toBe(100)
    // Sans trace à proximité → 0 %.
    const { results: r2 } = runMatching([itin], [[5.5, LAT]], opts())
    expect(r2[0]!.pct).toBe(0)
  })

  it('un way sans géométrie exploitable (0 ou 1 point) ne casse rien', () => {
    const itin = makeItinerary(1, [
      { osmWayId: 10, coords: [] },
      { osmWayId: 11, coords: [[4.5, LAT]] },
    ])
    const { results } = runMatching([itin], [[4.5, LAT]], opts())
    expect(results[0]!.totalMeters).toBe(0)
    expect(results[0]!.pct).toBe(0)
  })

  it('way partagé entre 2 itinéraires : compté 1× en global, 1× dans chacun', () => {
    const shared = straightLine(4.5, LAT, 1000, 100) // 11 échantillons
    const only2 = straightLine(4.7, LAT + 0.05, 1000, 100) // loin de la trace
    const itin1 = makeItinerary(1, [{ osmWayId: 10, coords: shared }])
    const itin2 = makeItinerary(2, [
      { osmWayId: 10, coords: shared },
      { osmWayId: 20, coords: only2 },
    ])
    // La trace couvre exactement le way partagé.
    const { results, global } = runMatching([itin1, itin2], shared, opts())

    const r1 = results.find((r) => r.itineraryId === 1)!
    const r2 = results.find((r) => r.itineraryId === 2)!
    // Chaque itinéraire compte le way partagé dans sa propre complétion.
    expect(r1.pct).toBe(100)
    expect(r1.doneMeters).toBe(1100) // 11 échantillons × 100 m
    expect(r2.doneMeters).toBe(1100)
    expect(r2.totalMeters).toBe(2200)
    expect(r2.pct).toBeCloseTo(50, 5)
    // En global, le way partagé n'est compté qu'une seule fois.
    expect(global.totalMeters).toBe(2200) // 22 échantillons uniques × 100 m
    expect(global.doneMeters).toBe(1100)
    expect(global.pct).toBeCloseTo(50, 5)
  })

  it('accepte les itinéraires persos (ids négatifs, réseau PERSO)', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const itin = makeItinerary(-1, [{ osmWayId: -1, coords: line }], {
      network: 'PERSO',
      ref: null,
      name: 'Boucle perso',
    })
    const { results, byNetwork } = runMatching([itin], line, opts())
    expect(results[0]!.itineraryId).toBe(-1)
    expect(results[0]!.pct).toBe(100)
    expect(byNetwork.PERSO.doneMeters).toBe(1100)
  })

  it('la tolérance reste paramétrable, mais ne suffit plus à elle seule', () => {
    const line = straightLine(4.5, LAT, 1000, 100)
    const itin = makeItinerary(1, [{ osmWayId: 10, coords: line }])

    // Un décalage modeste (15 m, bruit GPS courant) reste crédité.
    const proche = shiftNorth(straightLine(4.5, LAT, 1000, 10), 15)
    expect(
      runMatching([itin], proche, {
        toleranceMeters: 50,
        stepMeters: 100,
        computedAt: NOW,
      }).results[0]!.pct,
    ).toBe(100)

    // Un décalage constant de 70 m ne l'est pas, même en montant la tolérance
    // à 100 m : un écart régulier qui ne se referme jamais est la signature
    // d'un chemin parallèle, pas d'un GPS imprécis. Comportement délibérément
    // changé — cf. docs/PRODUCT_AUDIT.md (P0-1).
    const loin = shiftNorth(straightLine(4.5, LAT, 1000, 10), 70)
    expect(
      runMatching([itin], loin, {
        toleranceMeters: 100,
        stepMeters: 100,
        computedAt: NOW,
      }).results[0]!.pct,
    ).toBe(0)
  })

  it('répartit les stats par réseau sans double compte global', () => {
    const gr = straightLine(4.5, LAT, 1000, 100)
    const pr = straightLine(4.5, LAT + 0.05, 1000, 100)
    const itinGr = makeItinerary(1, [{ osmWayId: 10, coords: gr }], {
      network: 'GR',
    })
    const itinPr = makeItinerary(2, [{ osmWayId: 20, coords: pr }], {
      network: 'PR',
      ref: 'PR TEST',
    })
    const { byNetwork, global } = runMatching([itinGr, itinPr], gr, opts())
    expect(byNetwork.GR.doneMeters).toBe(1100)
    expect(byNetwork.GR.totalMeters).toBe(1100)
    expect(byNetwork.PR.doneMeters).toBe(0)
    expect(byNetwork.PR.totalMeters).toBe(1100)
    expect(byNetwork.GRP.totalMeters).toBe(0)
    expect(global.totalMeters).toBe(2200)
  })
})
