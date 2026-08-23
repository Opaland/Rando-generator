import { describe, it, expect } from 'vitest'
import { buildDeclaresGeoJSON } from '../../src/core/mapdata.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { ParcoursDeclare } from '../../src/core/declaratif.ts'

/**
 * Issue #158, seconde piste — le figuré distinct sur la carte.
 *
 * Un itinéraire coché à la main se voit, mais **pas comme un itinéraire
 * mesuré**. Le figuré retenu est le trait discontinu, dans la couleur de son
 * réseau : mesuré = plein, déclaré = pointillé.
 *
 * Pourquoi le figuré et non une couleur : l'audit global avait relevé deux
 * jetons de couleur nés entre deux sprints sans que personne les ait
 * décidés. En ajouter un troisième pour dire « déclaré » referait la même
 * erreur — et une couleur de plus se disputerait la lecture avec les cinq
 * couleurs de réseau, qui, elles, portent déjà une information.
 */

const GR = makeItinerary(1, [
  { osmWayId: 10, coords: straightLine(4.5, 45.4, 2_000, 100) },
])
const PR = makeItinerary(2, [
  { osmWayId: 20, coords: straightLine(4.7, 45.4, 1_000, 100) },
], { network: 'PR' })

function declare(id: number): ParcoursDeclare {
  return { itineraryId: id, date: null, declareLe: '2026-08-23T10:00:00.000Z' }
}

describe('buildDeclaresGeoJSON', () => {
  it('ne dessine rien quand rien n’est déclaré', () => {
    expect(buildDeclaresGeoJSON([GR, PR], []).features).toHaveLength(0)
  })

  it('dessine les chemins de l’itinéraire coché, et lui seul', () => {
    const geo = buildDeclaresGeoJSON([GR, PR], [declare(2)])
    expect(geo.features).toHaveLength(1)
    expect(geo.features[0]?.properties.itineraryId).toBe(2)
  })

  /** La couleur reste celle du réseau : c'est le trait qui distingue. */
  it('garde le réseau de l’itinéraire', () => {
    const geo = buildDeclaresGeoJSON([GR, PR], [declare(2)])
    expect(geo.features[0]?.properties.network).toBe('PR')
  })

  it('ignore une déclaration qui ne correspond à aucun itinéraire chargé', () => {
    expect(buildDeclaresGeoJSON([GR], [declare(999)]).features).toHaveLength(0)
  })

  it('dessine tous les chemins d’un itinéraire en plusieurs morceaux', () => {
    const enDeux = makeItinerary(3, [
      { osmWayId: 30, coords: straightLine(4.9, 45.4, 500, 100) },
      { osmWayId: 31, coords: straightLine(4.95, 45.4, 500, 100) },
    ])
    expect(
      buildDeclaresGeoJSON([enDeux], [declare(3)]).features,
    ).toHaveLength(2)
  })

  /** Un chemin d'un seul point ne fait pas une ligne, et ferait planter le style. */
  it('écarte un chemin trop court pour être une ligne', () => {
    const degenere = makeItinerary(4, [{ osmWayId: 40, coords: [[4.5, 45.4]] }])
    expect(
      buildDeclaresGeoJSON([degenere], [declare(4)]).features,
    ).toHaveLength(0)
  })
})
