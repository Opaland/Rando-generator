import { describe, it, expect } from 'vitest'
import { attributionDuTrace, sourcesDe } from '../../src/core/attributionDuTrace.ts'
import { attributionDe, gpxAttributionFor } from '../../src/core/gpxExport.ts'
import type { Itinerary, LonLat, Network } from '../../src/core/types.ts'

/**
 * Issue #557, point 1 — le tracé dessiné copie la géométrie des sentiers
 * qu'il suit, et s'exportait sans attribution.
 *
 * `gpxExport.ts` affirmait : « Rien à dire pour un tracé dessiné à la main :
 * il n'a pas de source manquante, il n'en a pas. » Or le crayon suit les
 * chemins du graphe (`routeThrough`), c'est-à-dire la géométrie OSM, des
 * boucles de la Métropole, des imports — et un sommet exporté depuis un GR
 * portait l'ODbL quand le même sommet passé par le crayon ne portait rien.
 * C'est le §4bis mot pour mot : « Tracé de l'utilisateur : rien à
 * attribuer, c'est le sien ».
 */

function itineraire(
  id: number,
  network: Network,
  coords: LonLat[],
  attribution?: Itinerary['attribution'],
): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: null,
    network,
    ways: [{ osmWayId: id, coords }],
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
    ...(attribution !== undefined && { attribution }),
  }
}

const GR: LonLat[] = [
  [4.5, 45.4],
  [4.501, 45.4],
  [4.502, 45.4],
]
const BOUCLE: LonLat[] = [
  [4.502, 45.4],
  [4.503, 45.4],
  [4.504, 45.4],
]
const PDIPR = { author: 'Département de l’Isère', license: 'Licence Ouverte 2.0' }

describe('attributionDuTrace', () => {
  it('un tracé qui suit un GR porte l’ODbL', () => {
    expect(
      attributionDuTrace(GR, [itineraire(1, 'GR', GR)]),
    ).toEqual(gpxAttributionFor('GR'))
  })

  it('un tracé qui suit un PDIPR importé porte la source de celui-ci', () => {
    expect(
      attributionDuTrace(GR, [itineraire(-1, 'PERSO', GR, PDIPR)]),
    ).toEqual(PDIPR)
  })

  it('un tracé qui suit deux sources les crédite toutes les deux', () => {
    const chemin: LonLat[] = [...GR, ...BOUCLE.slice(1)]
    const attribution = attributionDuTrace(chemin, [
      itineraire(1, 'GR', GR),
      itineraire(2, 'LOCAL', BOUCLE),
    ])
    const osm = gpxAttributionFor('GR')
    const metropole = gpxAttributionFor('LOCAL')
    expect(attribution?.author).toContain(osm?.author)
    expect(attribution?.author).toContain(metropole?.author)
    expect(attribution?.license).toContain(osm?.license)
    expect(attribution?.license).toContain(metropole?.license)
  })

  it('une même source suivie deux fois n’est créditée qu’une fois', () => {
    const chemin: LonLat[] = [...GR, ...BOUCLE.slice(1)]
    expect(
      attributionDuTrace(chemin, [
        itineraire(1, 'GR', GR),
        itineraire(2, 'PR', BOUCLE),
      ]),
    ).toEqual(gpxAttributionFor('GR'))
  })

  it('croiser un sentier sans le suivre ne le crédite pas', () => {
    // Le tracé suit la boucle et ne fait que toucher le GR à son départ.
    expect(
      attributionDuTrace(BOUCLE, [
        itineraire(1, 'GR', GR),
        itineraire(2, 'LOCAL', BOUCLE),
      ]),
    ).toEqual(gpxAttributionFor('LOCAL'))
  })

  it('suivi dans l’autre sens, c’est le même sentier', () => {
    expect(
      attributionDuTrace([...GR].reverse(), [itineraire(1, 'GR', GR)]),
    ).toEqual(gpxAttributionFor('GR'))
  })

  it('sans source connue, rien n’est inventé', () => {
    expect(
      attributionDuTrace(GR, [itineraire(-1, 'PERSO', GR)]),
    ).toBeNull()
  })

  it('s’accorde avec attributionDe pour chaque itinéraire suivi', () => {
    const suivi = itineraire(-1, 'PERSO', GR, PDIPR)
    expect(attributionDuTrace(GR, [suivi])).toEqual(attributionDe(suivi))
  })
})

describe('sourcesDe', () => {
  it('sépare ce qu’attributionDuTrace a réuni, licence à espaces comprise', () => {
    const chemin: LonLat[] = [...GR, ...BOUCLE.slice(1)]
    const reunie = attributionDuTrace(chemin, [
      itineraire(1, 'GR', GR),
      itineraire(-2, 'PERSO', BOUCLE, PDIPR),
    ])
    expect(reunie && sourcesDe(reunie)).toEqual([gpxAttributionFor('GR'), PDIPR])
  })

  it('rend telle quelle une attribution simple', () => {
    expect(sourcesDe(PDIPR)).toEqual([PDIPR])
  })
})
