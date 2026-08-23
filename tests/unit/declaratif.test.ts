import { describe, it, expect } from 'vitest'
import {
  chiffresDeCompletion,
  estDeclare,
  libelleCompletion,
  metresDeclares,
  type ParcoursDeclare,
} from '../../src/core/declaratif.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

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

describe('chiffresDeCompletion', () => {
  const mesure = { doneMeters: 3_000, totalMeters: 15_000, pct: 20 }

  it('rend deux nombres, jamais leur somme', () => {
    const c = chiffresDeCompletion(mesure, [DIX_KM, CINQ_KM], [declare(2)])
    expect(c.pctMesure).toBeCloseTo(20, 1)
    expect(c.pctDeclare).toBeCloseTo((CINQ_KM.totalMeters / 15_000) * 100, 1)
  })

  /**
   * Le cas qui décide de tout : un itinéraire à la fois **mesuré en partie**
   * et coché à la main. Les mètres mesurés dessus ne doivent pas être
   * comptés deux fois, et le déclaratif ne doit pas effacer la mesure — la
   * mesure prime, le déclaratif ne comble que ce qu'elle ne couvre pas.
   */
  it('ne compte pas deux fois un itinéraire mesuré puis coché', () => {
    const c = chiffresDeCompletion(
      { doneMeters: 2_000, totalMeters: 5_000, pct: 40 },
      [CINQ_KM],
      [declare(2)],
      { mesuresParItineraire: new Map([[2, 2_000]]) },
    )
    expect(c.metresDeclares).toBeCloseTo(CINQ_KM.totalMeters - 2_000, 0)
    expect(c.pctMesure + c.pctDeclare).toBeLessThanOrEqual(100.001)
  })

  it('ne déborde pas quand rien n’est déclaré', () => {
    const c = chiffresDeCompletion(mesure, [DIX_KM, CINQ_KM], [])
    expect(c.pctDeclare).toBe(0)
    expect(c.metresDeclares).toBe(0)
  })

  it('ne divise pas par zéro', () => {
    const c = chiffresDeCompletion(
      { doneMeters: 0, totalMeters: 0, pct: 0 },
      [],
      [],
    )
    expect(c.pctMesure).toBe(0)
    expect(c.pctDeclare).toBe(0)
  })
})

describe('libelleCompletion', () => {
  /**
   * Un seul chiffre tant que rien n'est déclaré : la grande majorité des
   * écrans ne doit pas payer le prix d'une distinction qui ne les concerne
   * pas.
   */
  it('ne mentionne pas le déclaratif quand il n’y en a pas', () => {
    expect(libelleCompletion({ pctMesure: 43.2, pctDeclare: 0 })).toBe('43,2 %')
  })

  it('sépare les deux dès qu’il y en a', () => {
    expect(libelleCompletion({ pctMesure: 43.2, pctDeclare: 12 })).toBe(
      '43,2 % mesurés · 12 % déclarés',
    )
  })
})
