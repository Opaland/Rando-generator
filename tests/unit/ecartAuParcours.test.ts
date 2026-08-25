import { describe, it, expect } from 'vitest'
import {
  ecartAuParcours,
  phraseDEcart,
} from '../../src/core/ecartAuParcours.ts'
import type { Itinerary } from '../../src/core/types.ts'

/**
 * Savoir où l'on est par rapport au parcours suivi (issue #154).
 *
 * L'issue demande une hystérésis « pour éviter le clignotement à la limite
 * du corridor ». Elle n'existe pas ici — parce qu'il n'y a **pas de
 * corridor**. Voir l'en-tête du module : le clignotement est un symptôme du
 * booléen, pas de la mesure.
 *
 * Ce que l'issue interdit, en revanche, est tenu à la lettre : jamais
 * d'alerte, jamais de dispositif de sécurité. Sentiers est un carnet, pas un
 * GPS de secours, et une phrase mal formulée aurait des conséquences réelles
 * si quelqu'un s'y fiait en montagne.
 */

const LAT = 45.4
const METER_LAT = 1 / 111_195

function droit(): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways: [
      {
        osmWayId: 10,
        coords: [
          [4.5, LAT],
          [4.6, LAT],
        ],
      },
    ],
    totalMeters: 7_800,
    fetchedAt: '2026-08-25T00:00:00Z',
  }
}

describe('ecartAuParcours (#154)', () => {
  it('rend zéro sur le tracé', () => {
    expect(ecartAuParcours([4.55, LAT], droit())).toBeCloseTo(0, 0)
  })

  it('rend la distance au plus proche point du tracé', () => {
    const cent = LAT + 100 * METER_LAT
    const ecart = ecartAuParcours([4.55, cent], droit())
    expect(ecart).toBeGreaterThan(90)
    expect(ecart).toBeLessThan(110)
  })

  /**
   * Au-delà d'un bout du tracé, c'est la distance à ce bout qui compte — pas
   * la distance à sa droite prolongée. Quelqu'un qui a dépassé la fin du
   * GR n'en est pas à zéro mètre.
   */
  it('mesure depuis l’extrémité quand on est au-delà', () => {
    const ecart = ecartAuParcours([4.7, LAT], droit())
    expect(ecart).toBeGreaterThan(7_000)
  })

  it('rend null sans géométrie', () => {
    expect(ecartAuParcours([4.5, LAT], { ...droit(), ways: [] })).toBeNull()
  })
})

describe('phraseDEcart — constater, jamais alarmer', () => {
  it('nomme l’itinéraire et la distance', () => {
    expect(phraseDEcart(400, droit())).toBe('Vous êtes à 400 m du GR 7.')
  })

  it('dit « sur » quand on y est', () => {
    expect(phraseDEcart(8, droit())).toBe('Vous êtes sur le GR 7.')
  })

  it('passe au kilomètre quand c’est loin', () => {
    expect(phraseDEcart(2_400, droit())).toBe('Vous êtes à 2,4 km du GR 7.')
  })

  /**
   * Le cœur de l'issue, et la seule chose qu'elle interdit nommément.
   *
   * « Sentiers est un carnet, pas un GPS de secours : c'est écrit dans
   * BRIEF.md et sur la page publique, et une alerte mal formulée le
   * contredirait — avec des conséquences réelles si quelqu'un s'y fiait en
   * montagne. »
   *
   * Le test cherche donc la **formule**, à toutes les distances, plutôt que
   * de faire confiance à la relecture d'aujourd'hui.
   */
  it('n’alarme à aucune distance', () => {
    const interdits = [
      /attention/i,
      /alerte/i,
      /danger/i,
      /hors\s+itin/i,
      /perdu/i,
      /!/,
    ]
    for (const metres of [0, 5, 50, 400, 2_000, 20_000]) {
      const phrase = phraseDEcart(metres, droit())
      for (const interdit of interdits) {
        expect(
          phrase,
          `à ${String(metres)} m, la phrase alarme : « ${phrase} »`,
        ).not.toMatch(interdit)
      }
    }
  })
})
