import { describe, it, expect } from 'vitest'
import { tracesHorsZone } from '../../src/core/couverture.ts'
import type { Itinerary, Track } from '../../src/core/types.ts'

/**
 * Sorties hors de la zone chargée (issue #133).
 *
 * Une sortie faite ailleurs compte dans « Mes sorties » — l'historique
 * additionne toutes les traces — mais pas au tableau de bord, dont le
 * pourcentage ne porte que sur les itinéraires téléchargés. Les deux chiffres
 * sont justes ; leur écart n'était expliqué nulle part.
 */
const PILAT: Itinerary = {
  osmRelationId: 1,
  ref: 'GR 7',
  name: null,
  network: 'GR',
  ways: [
    {
      osmWayId: 10,
      coords: [
        [4.5, 45.4],
        [4.53, 45.42],
      ],
    },
  ],
  totalMeters: 3_000,
  fetchedAt: '2026-08-20T00:00:00Z',
}

function trace(id: string, points: [number, number][]): Track {
  return {
    id,
    filename: `${id}.gpx`,
    points,
    date: null,
    importedAt: '2026-08-20T00:00:00Z',
    elevationGain: null,
  }
}

describe('tracesHorsZone', () => {
  it('ne compte pas une sortie faite dans la zone', () => {
    const dedans = trace('pilat', [
      [4.51, 45.41],
      [4.52, 45.41],
    ])
    expect(tracesHorsZone([dedans], [PILAT])).toEqual([])
  })

  it('repère une sortie faite ailleurs', () => {
    // La Bretagne, pendant qu'on a chargé le Pilat.
    const bretagne = trace('bretagne', [
      [-3.5, 48.6],
      [-3.49, 48.61],
    ])
    expect(tracesHorsZone([bretagne], [PILAT]).map((t) => t.id)).toEqual([
      'bretagne',
    ])
  })

  it('garde une sortie qui ne fait qu’effleurer la zone', () => {
    // Une traversée qui commence hors cadre n'est pas « ailleurs » : une
    // partie de ses kilomètres peut compter.
    const traversee = trace('traversee', [
      [3.0, 44.0],
      [4.51, 45.41],
    ])
    expect(tracesHorsZone([traversee], [PILAT])).toEqual([])
  })

  it('tolère une marge autour du cadre, pour ne pas exclure au mètre près', () => {
    // Juste en dehors du cadre des tracés : sur le terrain, c'est le même
    // massif, et le hasard du cadrage ne doit pas décider.
    const enBordure = trace('bordure', [
      [4.531, 45.421],
      [4.532, 45.422],
    ])
    expect(tracesHorsZone([enBordure], [PILAT])).toEqual([])
  })

  it('ne dit rien quand aucune zone n’est chargée', () => {
    // Sans zone, il n'y a pas de « hors zone » : l'utilisateur n'a pas encore
    // choisi de périmètre, on ne va pas lui reprocher ses traces.
    const quelconque = trace('a', [
      [-3.5, 48.6],
      [-3.49, 48.61],
    ])
    expect(tracesHorsZone([quelconque], [])).toEqual([])
  })

  it('ignore une trace sans point', () => {
    expect(tracesHorsZone([trace('vide', [])], [PILAT])).toEqual([])
  })
})
