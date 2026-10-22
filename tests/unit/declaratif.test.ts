import { describe, it, expect } from 'vitest'
import {
  chiffresDeCompletion,
  estDeclare,
  metresDeclares,
  type ParcoursDeclare,
} from '../../src/core/declaratif.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import { runMatching } from '../../src/core/matching.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * Issue #158 — « j'ai fait celui-là », sans trace GPX.
 *
 * Sylvie n'a aucun fichier : ses quinze PR sont dans sa tête. C'est le seul
 * persona pour qui l'application reste inutilisable de bout en bout, et le
 * profil le plus nombreux — la majorité des randonneurs n'enregistrent rien.
 *
 * Le point délicat de l'issue est la règle de ce module : **un itinéraire
 * coché à la main ne doit jamais se confondre avec un itinéraire mesuré.**
 * Tout le produit repose sur « le chiffre est vrai » ; les additionner en
 * silence le détruirait.
 *
 * Ce n'est pas une discipline, c'est une propriété de structure : le
 * déclaratif n'entre **jamais** dans le pipeline de matching. Il ne produit
 * aucun échantillon, donc « prochaine sortie », les tronçons restants et la
 * plus longue série continue l'ignorent sans qu'aucun code ne les en
 * protège — ils n'y ont simplement pas accès.
 */

const DIX_KM = makeItinerary(1, [
  { osmWayId: 10, coords: straightLine(4.5, 45.4, 10_000, 100) },
])
const CINQ_KM = makeItinerary(2, [
  { osmWayId: 20, coords: straightLine(4.7, 45.4, 5_000, 100) },
])

function declare(id: number, date: string | null = null): ParcoursDeclare {
  return { itineraryId: id, date, declareLe: '2026-08-23T10:00:00.000Z' }
}

describe('estDeclare', () => {
  it('reconnaît un itinéraire coché', () => {
    expect(estDeclare([declare(1)], 1)).toBe(true)
  })

  it('ne reconnaît rien d’autre', () => {
    expect(estDeclare([declare(1)], 2)).toBe(false)
    expect(estDeclare([], 1)).toBe(false)
  })
})

describe('metresDeclares', () => {
  it('additionne la longueur des itinéraires cochés', () => {
    expect(metresDeclares([DIX_KM, CINQ_KM], [declare(2)])).toBeCloseTo(
      CINQ_KM.totalMeters,
      0,
    )
  })

  /** Une déclaration qui ne correspond à rien de chargé ne compte pas. */
  it('ignore une déclaration sans itinéraire', () => {
    expect(metresDeclares([DIX_KM], [declare(999)])).toBe(0)
  })
})

/*
  Les chiffres se comptent en échantillons, des deux côtés (#564).

  Le pourcentage déclaré prenait `itin.totalMeters` au numérateur et le
  total en échantillons au dénominateur, où un way partagé ne compte qu'une
  fois. Deux GR qui partagent un way, cochés, rien de mesuré : 121,2 %
  déclarés ; un itinéraire fragmenté coché en entier : 30 %. Tranché par
  Cédric le 20/10 : la longueur affichée est `totalMeters`, mais le
  pourcentage déclaré compte les mêmes échantillons que la mesure.
*/
function mesurer(itineraires: Itinerary[], trace: LonLat[] = []) {
  return runMatching(itineraires, trace, {
    toleranceMeters: 50,
    computedAt: '2026-08-23T10:00:00.000Z',
  })
}

describe('chiffresDeCompletion', () => {
  it('rend deux nombres, jamais leur somme', () => {
    const m = mesurer([DIX_KM, CINQ_KM])
    const c = chiffresDeCompletion(m, [declare(2)])
    expect(c.pctMesure).toBe(0)
    expect(c.pctDeclare).toBeCloseTo((50 / 150) * 100, 0)
  })

  /**
   * Le cas qui décide de tout : un itinéraire à la fois **mesuré en partie**
   * et coché à la main. Les mètres mesurés dessus ne doivent pas être
   * comptés deux fois, et le déclaratif ne doit pas effacer la mesure — la
   * mesure prime, le déclaratif ne comble que ce qu'elle ne couvre pas.
   */
  it('ne compte pas deux fois un itinéraire mesuré puis coché', () => {
    const moitie = straightLine(4.7, 45.4, 2_500, 20)
    const m = mesurer([CINQ_KM], moitie)
    expect(m.global.pct).toBeGreaterThan(30)
    const c = chiffresDeCompletion(m, [declare(2)])
    expect(c.pctMesure + c.pctDeclare).toBeCloseTo(100, 6)
  })

  it('deux itinéraires cochés qui partagent un way ne dépassent pas 100 %', () => {
    const commun = straightLine(4.5, 45.4, 3_000, 100)
    const a = makeItinerary(1, [{ osmWayId: 10, coords: commun }])
    const b = makeItinerary(2, [
      { osmWayId: 10, coords: commun },
      { osmWayId: 11, coords: straightLine(4.6, 45.4, 1_000, 100) },
    ])
    const c = chiffresDeCompletion(mesurer([a, b]), [declare(1), declare(2)])
    expect(c.pctDeclare).toBeCloseTo(100, 6)
  })

  it('un itinéraire fragmenté coché en entier compte en entier', () => {
    const ways = Array.from({ length: 100 }, (_, i) => ({
      osmWayId: 100 + i,
      coords: straightLine(4.5 + i * 0.001, 45.4, 30, 10),
    }))
    const fragmente = makeItinerary(3, ways)
    const c = chiffresDeCompletion(mesurer([fragmente]), [declare(3)])
    expect(c.pctDeclare).toBeCloseTo(100, 6)
  })

  it('ne déborde pas quand rien n’est déclaré', () => {
    const c = chiffresDeCompletion(mesurer([DIX_KM, CINQ_KM]), [])
    expect(c.pctDeclare).toBe(0)
    expect(c.metresDeclares).toBe(0)
  })

  it('ne divise pas par zéro', () => {
    const c = chiffresDeCompletion(mesurer([]), [])
    expect(c.pctMesure).toBe(0)
    expect(c.pctDeclare).toBe(0)
  })
})
