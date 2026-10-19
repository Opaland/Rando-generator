import { describe, it, expect } from 'vitest'
import {
  buildDeclaresGeoJSON,
  buildTracksGeoJSON,
  buildTrailGeoJSON,
  interruptionsDuTrace,
  itineraryCoords,
} from '../../src/core/mapdata.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { buildSamples } from '../../src/core/matching.ts'
import type { Itinerary, LonLat, Network, TrailWay } from '../../src/core/types.ts'

/**
 * Ce qu'on remet à la carte, là où la vague de mutation du 19/10 l'a trouvé
 * sans test.
 *
 * 30 survivants sur `core/mapdata.ts`. Les plus lourds : l'axe des
 * distances après un deuxième trou (`cumul -= saut` passait), la jonction
 * de deux chemins à la même longitude, le réseau qui colore un chemin
 * partagé à égalité de priorité, et la portion parcourue qui enjambait un
 * échantillon non parcouru.
 */

const est = (m: number, nord = 0): LonLat => [5.7 + m / 78_710, 45.1 + nord / 111_320]

function itineraire(id: number, ways: TrailWay[], network: Network = 'PR'): Itinerary {
  return { osmRelationId: id, ref: null, name: `i${String(id)}`, network, ways, totalMeters: 0, fetchedAt: '' }
}
const way = (id: number, coords: LonLat[]): TrailWay => ({ osmWayId: id, coords })

describe('itineraryCoords', () => {
  it('ne répète pas le point où deux chemins se touchent', () => {
    const coords = itineraryCoords(itineraire(1, [way(1, [est(0), est(500)]), way(2, [est(500), est(1_000)])]))
    expect(coords).toEqual([est(0), est(500), est(1_000)])
  })

  it('ne prend pas pour un même point deux points à la même longitude', () => {
    // Le second chemin part à la verticale du bout du premier, 300 m au
    // nord : ce n'est pas une jonction, et son premier point compte.
    const coords = itineraryCoords(
      itineraire(1, [way(1, [est(0), est(500)]), way(2, [est(500, 300), est(1_000, 300)])]),
    )
    expect(coords).toHaveLength(4)
  })
})

describe('interruptionsDuTrace', () => {
  it('place le deuxième trou sur l’axe, après le premier', () => {
    // Trois morceaux, deux trous de 300 m et 400 m.
    const morceaux = [
      way(1, [est(0), est(1_000)]),
      way(2, [est(1_300), est(2_000)]),
      way(3, [est(2_400), est(3_000)]),
    ]
    const [premier, second] = interruptionsDuTrace(itineraire(1, morceaux))
    const l1 = distanceMeters(est(0), est(1_000))
    const g1 = distanceMeters(est(1_000), est(1_300))
    const l2 = distanceMeters(est(1_300), est(2_000))
    expect(premier?.debutMetres).toBeCloseTo(l1, 6)
    expect(second?.debutMetres).toBeCloseTo(l1 + g1 + l2, 6)
  })
})

describe('buildTrailGeoJSON', () => {
  const partage = way(10, [est(0), est(1_000)])

  it('laisse au premier itinéraire un chemin partagé à priorité égale', () => {
    const { base } = buildTrailGeoJSON([itineraire(1, [partage]), itineraire(2, [partage])], [])
    expect(base.features[0]?.properties.itineraryId).toBe(1)
    expect(base.features[0]?.properties.itineraryIds).toEqual([1, 2])
  })

  it('ne répète pas un itinéraire qui cite deux fois le même chemin', () => {
    const { base } = buildTrailGeoJSON([itineraire(1, [partage, partage])], [])
    expect(base.features[0]?.properties.itineraryIds).toEqual([1])
  })

  it('ne fait pas une ligne d’un chemin d’un seul point', () => {
    const { base } = buildTrailGeoJSON([itineraire(1, [way(11, [est(0)]), partage])], [])
    expect(base.features.map((f) => f.properties.wayId)).toEqual([10])
  })

  it('coupe la portion parcourue au passage d’un chemin au suivant', () => {
    // Deux chemins parcourus en entier : deux portions, chacune sur son
    // chemin — pas une seule qui partirait du rang du premier sur le second.
    const itin = itineraire(1, [partage, way(20, [est(1_000), est(1_800)])])
    const samples = buildSamples([itin], 100).map((s) => ({ ...s, done: true }))
    const { done } = buildTrailGeoJSON([itin], samples, 100)
    expect(done.features.map((f) => f.properties.wayId)).toEqual([10, 20])
    expect(done.features[1]?.geometry.coordinates[0]).toEqual(est(1_000))
  })

  it('rend du GeoJSON que MapLibre accepte', () => {
    const { base, done } = buildTrailGeoJSON([itineraire(1, [partage])], [])
    expect(base.type).toBe('FeatureCollection')
    expect(done.type).toBe('FeatureCollection')
    expect(base.features[0]?.type).toBe('Feature')
    expect(buildDeclaresGeoJSON([], []).type).toBe('FeatureCollection')
    expect(buildTracksGeoJSON([]).type).toBe('FeatureCollection')
  })

  it('coupe la portion parcourue là où un échantillon ne l’est pas', () => {
    const itin = itineraire(1, [partage])
    const samples = buildSamples([itin], 100).map((s, i) => ({ ...s, done: i !== 4 }))
    const { done } = buildTrailGeoJSON([itin], samples, 100)
    expect(done.features).toHaveLength(2)
  })
})

describe('buildDeclaresGeoJSON et buildTracksGeoJSON', () => {
  it('dessine un chemin déclaré de deux points, avec son itinéraire', () => {
    const { features } = buildDeclaresGeoJSON([itineraire(7, [way(1, [est(0), est(500)])])], [{ itineraryId: 7 }])
    expect(features).toHaveLength(1)
    expect(features[0]?.properties.itineraryIds).toEqual([7])
  })

  it('nomme chaque trace par son identifiant', () => {
    const { features } = buildTracksGeoJSON([
      { id: 'sortie-1', filename: 'a.gpx', points: [est(0), est(100)], date: null, importedAt: '' },
    ])
    expect(features[0]?.properties).toEqual({ trackId: 'sortie-1' })
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `if (!way) continue` et `if (!premier) continue` : `chainWays` ne rend
    que des chemins de l'itinéraire, de deux points au moins ;
  - `saut >= MIN_GAP_METERS` en `>` : égalité exacte d'une distance en
    flottants ;
  - `if (!wayCoords.has(…))` forcé : un même `osmWayId` porte la même
    géométrie dans tous les itinéraires qui le citent ;
  - les variantes de la garde de `flush` : un passage sans début ni fin
    donne `slicePolyline(coords, 0, 0)`, qui rend une portion vide ;
  - `coords ? slicePolyline(…) : []` : `wayCoords` connaît tout chemin dont
    un échantillon existe.
*/
