import { describe, it, expect } from 'vitest'
import { vientDOpenStreetMap } from '../../src/core/provenance.ts'
import { LOCAL_RELATION_ID_BASE } from '../../src/core/boucles.ts'
import type { Itinerary, Network } from '../../src/core/types.ts'

function itin(network: Network, osmRelationId: number): Itinerary {
  return {
    osmRelationId,
    ref: null,
    name: 'Essai',
    network,
    ways: [],
    totalMeters: 1_000,
    fetchedAt: '2026-08-25T00:00:00Z',
  }
}

describe('vientDOpenStreetMap', () => {
  it('dit oui d’une relation OSM ordinaire', () => {
    expect(vientDOpenStreetMap(itin('GR', 1001))).toBe(true)
    expect(vientDOpenStreetMap(itin('PR', 42))).toBe(true)
    expect(vientDOpenStreetMap(itin('INCONNU', 7))).toBe(true)
  })

  it('dit non d’une boucle locale, par son réseau comme par son identifiant', () => {
    expect(
      vientDOpenStreetMap(itin('LOCAL', LOCAL_RELATION_ID_BASE + 12)),
    ).toBe(false)
  })

  it('dit non d’un itinéraire déposé ou dessiné', () => {
    expect(vientDOpenStreetMap(itin('PERSO', 5))).toBe(false)
  })

  it('penche vers « non » quand les deux critères se contredisent', () => {
    /*
      Se tromper dans ce sens fait taire une phrase. Se tromper dans l'autre
      fait attribuer à OpenStreetMap une donnée qu'il n'a jamais vue — c'est
      le défaut que l'issue #317 décrit, et il coûte plus cher.

      Les deux cas sont écrits parce que ce sont les deux moitiés de la
      garde : l'étiquette seule, et l'identifiant seul.
    */
    expect(vientDOpenStreetMap(itin('GR', LOCAL_RELATION_ID_BASE))).toBe(false)
    expect(vientDOpenStreetMap(itin('LOCAL', 1001))).toBe(false)
  })

  it('la borne est la base elle-même, pas la valeur suivante', () => {
    // Trouvé en écrivant : `>` au lieu de `>=` laissait passer exactement la
    // première boucle locale, celle dont le gid vaut zéro.
    expect(vientDOpenStreetMap(itin('GR', LOCAL_RELATION_ID_BASE - 1))).toBe(
      true,
    )
    expect(vientDOpenStreetMap(itin('GR', LOCAL_RELATION_ID_BASE))).toBe(false)
  })
})
