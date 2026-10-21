import { describe, it, expect } from 'vitest'
import { longueursDeLItineraire } from '../../src/core/longueurAffichee.ts'
import { runMatching } from '../../src/core/matching.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

/**
 * Issue #564 — deux longueurs pour un même itinéraire.
 *
 * La liste affichait `totalMeters`, la longueur exacte ; la carte et la
 * fiche affichaient le nombre d'échantillons fois 100 m. Un way de 1 250 m :
 * « 1,2 km » d'un côté, « 1,3 km » de l'autre ; cent ways de 30 m : 3 km
 * contre 10. Tranché par Cédric le 20/10 : la longueur affichée est
 * `totalMeters`, partout ; le parcouru en est la part que dit le
 * pourcentage.
 */
function mesurer(itin: ReturnType<typeof makeItinerary>) {
  return runMatching([itin], [], {
    toleranceMeters: 50,
    computedAt: '2026-10-20T00:00:00Z',
  }).results[0]
}

describe('longueursDeLItineraire', () => {
  it('rend la longueur exacte, pas les échantillons', () => {
    const itin = makeItinerary(1, [
      { osmWayId: 1, coords: straightLine(4.5, 45.4, 1_250, 50) },
    ])
    const resultat = mesurer(itin)
    expect(resultat?.totalMeters).not.toBeCloseTo(itin.totalMeters, 0)
    expect(longueursDeLItineraire(itin, resultat).total).toBeCloseTo(
      itin.totalMeters,
      6,
    )
  })

  it('un itinéraire en cent petits ways ne gonfle pas', () => {
    const ways = Array.from({ length: 100 }, (_, i) => ({
      osmWayId: 100 + i,
      coords: straightLine(4.5 + i * 0.001, 45.4, 30, 10),
    }))
    const itin = makeItinerary(2, ways)
    const { total } = longueursDeLItineraire(itin, mesurer(itin))
    expect(total).toBeCloseTo(itin.totalMeters, 6)
    expect(total).toBeLessThan(3_100)
  })

  it('le parcouru est la part du pourcentage, sur cette même longueur', () => {
    const itin = makeItinerary(3, [
      { osmWayId: 3, coords: straightLine(4.5, 45.4, 2_000, 50) },
    ])
    const { total, fait } = longueursDeLItineraire(itin, {
      itineraryId: 3,
      doneMeters: 900,
      totalMeters: 2_100,
      pct: 50,
      computedAt: '2026-10-20T00:00:00Z',
    })
    expect(fait).toBeCloseTo(total / 2, 6)
  })

  it('sans résultat, rien de parcouru', () => {
    const itin = makeItinerary(4, [
      { osmWayId: 4, coords: straightLine(4.5, 45.4, 500, 50) },
    ])
    expect(longueursDeLItineraire(itin, undefined)).toEqual({
      total: itin.totalMeters,
      fait: 0,
    })
  })
})
