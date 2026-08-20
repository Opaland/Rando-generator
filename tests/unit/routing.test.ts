import { describe, it, expect } from 'vitest'
import {
  buildRoutingGraph,
  clefsAllerRetour,
  clefsBouclees,
  findPath,
  nodeKey,
  routeThrough,
  snapToNetwork,
  graphSize,
} from '../../src/core/routing.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

function itinerary(id: number, ways: LonLat[][]): Itinerary {
  return {
    osmRelationId: id,
    ref: `T${id}`,
    name: null,
    network: 'GR',
    ways: ways.map((coords, i) => ({ osmWayId: id * 100 + i, coords })),
    totalMeters: ways.reduce((sum, c) => sum + polylineLengthMeters(c), 0),
    fetchedAt: '2026-08-19T12:00:00Z',
  }
}

/**
 * Réseau en T : une branche est-ouest coupée en deux ways à la jonction
 * (4.510, 45.400), plus une branche nord depuis cette même jonction.
 *
 *                 (4.510, 45.410)  D
 *                        |
 *   A ----------- J ----------- C
 * (4.500,45.400) (4.510)   (4.520, 45.400)
 */
const OUEST: LonLat[] = [
  [4.5, 45.4],
  [4.505, 45.4],
  [4.51, 45.4],
]
const EST: LonLat[] = [
  [4.51, 45.4],
  [4.52, 45.4],
]
const NORD: LonLat[] = [
  [4.51, 45.4],
  [4.51, 45.41],
]

const RESEAU_T = [itinerary(1, [OUEST, EST, NORD])]

describe('buildRoutingGraph', () => {
  it('crée un nœud par sommet distinct et des arêtes dans les deux sens', () => {
    const graph = buildRoutingGraph(RESEAU_T)
    // A, milieu, jonction, C, D = 5 sommets distincts.
    expect(graphSize(graph).nodes).toBe(5)
    const junction = nodeKey(4.51, 45.4)
    // La jonction relie l'ouest, l'est et le nord.
    expect(graph.edges.get(junction)).toHaveLength(3)
    // Réciprocité : on peut revenir depuis l'est.
    const est = nodeKey(4.52, 45.4)
    expect(graph.edges.get(est)?.map((e) => e.to)).toEqual([junction])
  })

  it('raccorde deux ways dont la jonction diffère au bruit de virgule flottante', () => {
    // Cas réel : deux exports du même nœud OSM à 1e-7 près ne doivent pas
    // produire un réseau coupé en deux (sinon aucun itinéraire n'est routable).
    const decale: LonLat[] = [
      [4.5100001, 45.4000001],
      [4.52, 45.4],
    ]
    const graph = buildRoutingGraph([itinerary(1, [OUEST, decale])])
    const path = findPath(graph, nodeKey(4.5, 45.4), nodeKey(4.52, 45.4))
    expect(path).not.toBeNull()
    expect(path).toHaveLength(4)
  })

  it('ignore les ways trop courts et les segments de longueur nulle', () => {
    const graph = buildRoutingGraph([
      itinerary(1, [
        [[4.5, 45.4]],
        [
          [4.5, 45.4],
          [4.5, 45.4],
        ],
      ]),
    ])
    expect(graphSize(graph).edges).toBe(0)
  })

  it('déduplique les ways partagés entre itinéraires', () => {
    const partage = [itinerary(1, [OUEST]), itinerary(2, [OUEST])]
    const graph = buildRoutingGraph(partage)
    expect(graphSize(graph)).toEqual(graphSize(buildRoutingGraph([itinerary(1, [OUEST])])))
  })
})

describe('snapToNetwork', () => {
  const graph = buildRoutingGraph(RESEAU_T)

  it('accroche un clic au sommet le plus proche', () => {
    // ~20 m au nord du sommet de départ.
    const snapped = snapToNetwork(graph, [4.5001, 45.40015])
    expect(snapped).toBe(nodeKey(4.5, 45.4))
  })

  it('refuse un clic trop loin du réseau', () => {
    // Plusieurs kilomètres au sud : rien à accrocher.
    expect(snapToNetwork(graph, [4.5, 45.35])).toBeNull()
  })

  it('respecte la distance maximale demandée', () => {
    const loin: LonLat = [4.5, 45.4009] // ~100 m au nord
    expect(snapToNetwork(graph, loin, 200)).toBe(nodeKey(4.5, 45.4))
    expect(snapToNetwork(graph, loin, 50)).toBeNull()
  })

  it('retourne null sur un graphe vide', () => {
    expect(snapToNetwork(buildRoutingGraph([]), [4.5, 45.4])).toBeNull()
  })
})

describe('findPath', () => {
  const graph = buildRoutingGraph(RESEAU_T)

  it('suit les sommets du réseau entre deux points', () => {
    const path = findPath(graph, nodeKey(4.5, 45.4), nodeKey(4.52, 45.4))
    expect(path).toEqual([
      [4.5, 45.4],
      [4.505, 45.4],
      [4.51, 45.4],
      [4.52, 45.4],
    ])
  })

  it('passe par la jonction pour rejoindre la branche nord', () => {
    const path = findPath(graph, nodeKey(4.52, 45.4), nodeKey(4.51, 45.41))
    expect(path).toEqual([
      [4.52, 45.4],
      [4.51, 45.4],
      [4.51, 45.41],
    ])
  })

  it('choisit le chemin le plus court quand deux branches existent', () => {
    // Un raccourci direct entre A et C, plus court que le passage par la
    // jonction : c'est lui qui doit être emprunté.
    const raccourci: LonLat[] = [
      [4.5, 45.4],
      [4.52, 45.4],
    ]
    const g = buildRoutingGraph([itinerary(1, [OUEST, EST, NORD, raccourci])])
    const path = findPath(g, nodeKey(4.5, 45.4), nodeKey(4.52, 45.4))
    expect(path).toEqual([
      [4.5, 45.4],
      [4.52, 45.4],
    ])
  })

  it('retourne null si les deux points ne sont pas reliés', () => {
    const isole: LonLat[] = [
      [4.6, 45.5],
      [4.61, 45.5],
    ]
    const g = buildRoutingGraph([itinerary(1, [OUEST]), itinerary(2, [isole])])
    expect(findPath(g, nodeKey(4.5, 45.4), nodeKey(4.6, 45.5))).toBeNull()
  })

  it('retourne le point seul quand départ et arrivée coïncident', () => {
    expect(findPath(graph, nodeKey(4.5, 45.4), nodeKey(4.5, 45.4))).toEqual([
      [4.5, 45.4],
    ])
  })

  it('retourne null pour un nœud inconnu', () => {
    expect(findPath(graph, 'inexistant', nodeKey(4.5, 45.4))).toBeNull()
  })
})

describe('routeThrough', () => {
  const graph = buildRoutingGraph(RESEAU_T)

  it('enchaîne les étapes sans dupliquer les points de jonction', () => {
    const path = routeThrough(graph, [
      nodeKey(4.5, 45.4),
      nodeKey(4.52, 45.4),
      nodeKey(4.51, 45.41),
    ])
    expect(path).toEqual([
      [4.5, 45.4],
      [4.505, 45.4],
      [4.51, 45.4],
      [4.52, 45.4],
      [4.51, 45.4],
      [4.51, 45.41],
    ])
  })

  it('retourne null si une étape est injoignable', () => {
    const isole: LonLat[] = [
      [4.6, 45.5],
      [4.61, 45.5],
    ]
    const g = buildRoutingGraph([itinerary(1, [OUEST]), itinerary(2, [isole])])
    expect(
      routeThrough(g, [nodeKey(4.5, 45.4), nodeKey(4.6, 45.5)]),
    ).toBeNull()
  })

  it('gère zéro ou une seule étape', () => {
    expect(routeThrough(graph, [])).toEqual([])
    expect(routeThrough(graph, [nodeKey(4.5, 45.4)])).toEqual([[4.5, 45.4]])
  })
})

describe('performance', () => {
  it('construit le graphe et route sur un réseau réaliste en moins de 2 s', () => {
    // ~500 ways de 100 points : ordre de grandeur d'une grosse zone chargée.
    const ways: LonLat[][] = []
    for (let w = 0; w < 500; w++) {
      const coords: LonLat[] = []
      for (let i = 0; i < 100; i++) {
        coords.push([4.5 + i * 0.0002, 45.4 + w * 0.0005])
      }
      ways.push(coords)
      // Une liaison verticale entre bandes voisines pour un réseau connexe.
      if (w > 0) {
        ways.push([
          [4.5, 45.4 + (w - 1) * 0.0005],
          [4.5, 45.4 + w * 0.0005],
        ])
      }
    }
    const started = performance.now()
    const graph = buildRoutingGraph([itinerary(1, ways)])
    const from = snapToNetwork(graph, [4.5, 45.4])
    const to = snapToNetwork(graph, [4.5198, 45.4 + 499 * 0.0005])
    const path = findPath(graph, from as string, to as string)
    const elapsed = performance.now() - started
    expect(path).not.toBeNull()
    expect(elapsed).toBeLessThan(2000)
  })
})

describe('clefsAllerRetour', () => {
  it('revient par où l’on est venu, sans répéter le point de demi-tour', () => {
    expect(clefsAllerRetour(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'b', 'a'])
  })

  it('laisse un tracé trop court tel quel', () => {
    // Un seul point : il n'y a rien dont on puisse revenir.
    expect(clefsAllerRetour(['a'])).toEqual(['a'])
    expect(clefsAllerRetour([])).toEqual([])
  })

  it('sur deux points, fait l’aller-retour le plus simple', () => {
    expect(clefsAllerRetour(['a', 'b'])).toEqual(['a', 'b', 'a'])
  })
})

describe('clefsBouclees', () => {
  it('ramène au point de départ', () => {
    expect(clefsBouclees(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'a'])
  })

  it('ne refait pas un tour à une boucle déjà fermée', () => {
    expect(clefsBouclees(['a', 'b', 'c', 'a'])).toEqual(['a', 'b', 'c', 'a'])
  })

  it('refuse de boucler ce qui n’a pas de forme', () => {
    // Deux points bouclés, c'est un aller-retour : autant le dire par le
    // bouton qui porte ce nom.
    expect(clefsBouclees(['a', 'b'])).toEqual(['a', 'b'])
    expect(clefsBouclees([])).toEqual([])
  })
})
