import { describe, it, expect } from 'vitest'
import { segmentsDeRevetement } from '../../src/core/revetement.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

/**
 * Le terrain sur la carte (demande de Cédric, 24/08).
 *
 * Le revêtement n'existait que dans le profil altimétrique, en distance
 * cumulée. Pour le peindre sur la carte, il faut la même information mais
 * **en géométrie** : chaque tronçon avec ses coordonnées et sa famille.
 *
 * Ce n'est pas `bandesDeRevetement` avec un autre nom. Les bandes fusionnent
 * les voisins équivalents pour ne pas rendre des centaines de rectangles
 * identiques sous une courbe ; sur la carte, fusionner deux ways voisins
 * reviendrait à recoller leurs géométries, ce qui suppose qu'elles se
 * touchent — et un itinéraire OSM troué ne le garantit pas. Chaque way reste
 * donc un segment.
 */
function way(id: number, coords: [number, number][], tags?: Record<string, string>): TrailWay {
  return { osmWayId: id, coords, ...(tags ? { tags } : {}) }
}

function itineraire(ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways,
    totalMeters: 1000,
    fetchedAt: '2026-08-24T00:00:00Z',
  } as unknown as Itinerary
}

describe('segmentsDeRevetement', () => {
  it('rend un segment par tronçon, avec sa géométrie', () => {
    const segments = segmentsDeRevetement(
      itineraire([
        way(10, [[4.5, 45.4], [4.51, 45.4]], { surface: 'asphalt' }),
        way(11, [[4.51, 45.4], [4.52, 45.4]], { highway: 'path' }),
      ]),
    )
    expect(segments).toHaveLength(2)
    expect(segments[0]?.coords).toEqual([[4.5, 45.4], [4.51, 45.4]])
    expect(segments[0]?.famille).toBe('dur')
    expect(segments[1]?.famille).toBe('naturel')
  })

  /**
     * L'origine voyage avec la famille : un revêtement **renseigné** dans OSM et
   * revêtement **déduit** du type de voie ne disent pas la même chose, et la
   * carte doit pouvoir le montrer comme le profil le montre.
   */
  it('garde la distinction entre ce qui est lu et ce qui est supposé', () => {
    const segments = segmentsDeRevetement(
      itineraire([
        way(10, [[4.5, 45.4], [4.51, 45.4]], { surface: 'asphalt' }),
        way(11, [[4.51, 45.4], [4.52, 45.4]], { highway: 'residential' }),
      ]),
    )
    expect(segments[0]?.origine).toBe('renseigne')
    expect(segments[1]?.origine).toBe('deduit')
    expect(segments[1]?.famille).toBe('dur')
  })

  /**
   * Un tronçon d'un seul point n'a pas de longueur : le dessiner produirait
   * un artefact ponctuel qui ressemble à un repère. `bandesDeRevetement` les
   * écarte déjà pour la même raison.
   */
  it('écarte les tronçons sans longueur', () => {
    const segments = segmentsDeRevetement(
      itineraire([
        way(10, [[4.5, 45.4]], { surface: 'asphalt' }),
        way(11, [[4.5, 45.4], [4.51, 45.4]], { surface: 'gravel' }),
      ]),
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]?.famille).toBe('stabilise')
  })

  /**
   * Sans tag exploitable, la famille est « inconnu » — et le segment est
   * quand même rendu. C'est l'affichage qui décide de ne rien peindre, pas
   * le calcul : mélanger les deux enlèverait à la carte le moyen de dire
   * « ici, on ne sait pas », si un jour elle veut le dire.
   */
  it('rend aussi ce dont on ne sait rien', () => {
    const segments = segmentsDeRevetement(
      itineraire([way(10, [[4.5, 45.4], [4.51, 45.4]])]),
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]?.famille).toBe('inconnu')
    expect(segments[0]?.origine).toBe('inconnu')
  })
})
