import { cellIndices, cellKeyFromIndices, distanceMeters } from './geo.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * Routage sur le réseau de sentiers affiché : construit un graphe à partir
 * des ways déjà chargés (OSM, boucles open data…), accroche un clic au
 * sommet le plus proche et cherche le plus court chemin (Dijkstra).
 *
 * Pas de dépendance de routage externe : comme pour le reste du cœur
 * géométrique (cf. « Pas de turf.js » dans le README), l'algorithme est
 * recodé et testé — il tient en quelques dizaines de lignes et travaille
 * directement sur les LonLat du projet, sans conversion GeoJSON ni graphe
 * pré-généré à télécharger.
 */

/**
 * Pas de quantification des sommets (~1 m). Deux ways qui partagent une
 * jonction doivent tomber sur la même clé de nœud : les coordonnées OSM d'un
 * même nœud sont identiques, mais un arrondi d'export suffirait sinon à
 * couper le réseau en deux et à rendre tout trajet impossible.
 */
export const SNAP_PRECISION_DEG = 1e-5

/** Distance maximale par défaut entre un clic et le réseau, en mètres. */
export const DEFAULT_SNAP_METERS = 150

export interface RoutingEdge {
  to: string
  meters: number
}

export interface RoutingGraph {
  /** Clé de nœud → coordonnée représentative. */
  nodes: Map<string, LonLat>
  /** Clé de nœud → arêtes sortantes (le graphe est non orienté, donc symétrique). */
  edges: Map<string, RoutingEdge[]>
  /** Hachage spatial : clé de cellule → clés de nœuds, pour accrocher un clic. */
  index: Map<string, string[]>
}

/** Clé de nœud d'une coordonnée, quantifiée à SNAP_PRECISION_DEG. */
export function nodeKey(lon: number, lat: number): string {
  return `${Math.round(lon / SNAP_PRECISION_DEG)}:${Math.round(lat / SNAP_PRECISION_DEG)}`
}

/** Tailles du graphe (nœuds, arêtes orientées) — pour les tests et le debug. */
export function graphSize(graph: RoutingGraph): {
  nodes: number
  edges: number
} {
  let edges = 0
  for (const list of graph.edges.values()) edges += list.length
  return { nodes: graph.nodes.size, edges }
}

/**
 * Construit le graphe routable de tous les ways des itinéraires fournis.
 * Les arêtes en double (way partagé entre itinéraires, ou géométrie répétée
 * entre deux sources) ne sont ajoutées qu'une fois.
 */
export function buildRoutingGraph(itineraries: Itinerary[]): RoutingGraph {
  const graph: RoutingGraph = {
    nodes: new Map(),
    edges: new Map(),
    index: new Map(),
  }

  const addNode = (coord: LonLat): string => {
    const key = nodeKey(coord[0], coord[1])
    if (!graph.nodes.has(key)) {
      graph.nodes.set(key, coord)
      graph.edges.set(key, [])
      const cell = cellKeyFromIndices(...cellIndices(coord[0], coord[1]))
      const bucket = graph.index.get(cell)
      if (bucket) bucket.push(key)
      else graph.index.set(cell, [key])
    }
    return key
  }

  const link = (a: string, b: string, meters: number): void => {
    const list = graph.edges.get(a)
    if (!list || list.some((edge) => edge.to === b)) return
    list.push({ to: b, meters })
  }

  for (const itin of itineraries) {
    for (const way of itin.ways) {
      if (way.coords.length < 2) continue
      for (let i = 1; i < way.coords.length; i++) {
        const from = way.coords[i - 1] as LonLat
        const to = way.coords[i] as LonLat
        const fromKey = addNode(from)
        const toKey = addNode(to)
        // Segment dégénéré (points confondus après quantification).
        if (fromKey === toKey) continue
        const meters = distanceMeters(from, to)
        link(fromKey, toKey, meters)
        link(toKey, fromKey, meters)
      }
    }
  }

  return graph
}

/**
 * Accroche un point (clic carte) au sommet du réseau le plus proche, dans la
 * limite de `maxMeters`. Retourne null si le réseau est trop loin — plutôt
 * que de tracer un itinéraire qui ne suit aucun chemin.
 */
export function snapToNetwork(
  graph: RoutingGraph,
  point: LonLat,
  maxMeters: number = DEFAULT_SNAP_METERS,
): string | null {
  const [cx, cy] = cellIndices(point[0], point[1])
  // Rayon de recherche en cellules : une cellule fait ~120 m au minimum sous
  // nos latitudes, on prend 100 m pour rester conservateur.
  const radius = Math.max(1, Math.ceil(maxMeters / 100))

  let best: string | null = null
  let bestDistance = maxMeters
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const bucket = graph.index.get(cellKeyFromIndices(cx + dx, cy + dy))
      if (!bucket) continue
      for (const key of bucket) {
        const coord = graph.nodes.get(key)
        if (!coord) continue
        const distance = distanceMeters(point, coord)
        if (distance <= bestDistance) {
          bestDistance = distance
          best = key
        }
      }
    }
  }
  return best
}

/** Tas binaire minimal : file de priorité du Dijkstra. */
class MinHeap {
  private readonly items: { key: string; distance: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(key: string, distance: number): void {
    const items = this.items
    items.push({ key, distance })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if ((items[parent] as { distance: number }).distance <= distance) break
      items[i] = items[parent] as { key: string; distance: number }
      items[parent] = { key, distance }
      i = parent
    }
  }

  pop(): { key: string; distance: number } | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0 && last) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let smallest = i
        if (
          left < items.length &&
          (items[left] as { distance: number }).distance <
            (items[smallest] as { distance: number }).distance
        ) {
          smallest = left
        }
        if (
          right < items.length &&
          (items[right] as { distance: number }).distance <
            (items[smallest] as { distance: number }).distance
        ) {
          smallest = right
        }
        if (smallest === i) break
        const swap = items[i] as { key: string; distance: number }
        items[i] = items[smallest] as { key: string; distance: number }
        items[smallest] = swap
        i = smallest
      }
    }
    return top
  }
}

/**
 * Plus court chemin entre deux nœuds (Dijkstra), retourné comme la suite des
 * coordonnées des sommets traversés. Retourne null si l'un des nœuds est
 * inconnu ou si les deux ne sont pas reliés (réseau non connexe : deux
 * massifs sans sentier commun, tronçon isolé…).
 */
export function findPath(
  graph: RoutingGraph,
  fromKey: string,
  toKey: string,
): LonLat[] | null {
  const start = graph.nodes.get(fromKey)
  if (!start || !graph.nodes.has(toKey)) return null
  if (fromKey === toKey) return [start]

  const distances = new Map<string, number>([[fromKey, 0]])
  const previous = new Map<string, string>()
  const settled = new Set<string>()
  const queue = new MinHeap()
  queue.push(fromKey, 0)

  while (queue.size > 0) {
    const current = queue.pop()
    if (!current) break
    if (settled.has(current.key)) continue
    settled.add(current.key)
    if (current.key === toKey) break

    for (const edge of graph.edges.get(current.key) ?? []) {
      if (settled.has(edge.to)) continue
      const candidate = current.distance + edge.meters
      if (candidate < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, candidate)
        previous.set(edge.to, current.key)
        queue.push(edge.to, candidate)
      }
    }
  }

  if (!settled.has(toKey)) return null

  const path: LonLat[] = []
  let cursor: string | undefined = toKey
  while (cursor !== undefined) {
    const coord = graph.nodes.get(cursor)
    if (coord) path.push(coord)
    if (cursor === fromKey) break
    cursor = previous.get(cursor)
  }
  return path.reverse()
}

/**
 * Enchaîne les plus courts chemins entre des étapes successives, sans
 * dupliquer le point de jonction entre deux tronçons. Retourne null dès
 * qu'une étape est injoignable depuis la précédente.
 */
export function routeThrough(
  graph: RoutingGraph,
  waypointKeys: string[],
): LonLat[] | null {
  if (waypointKeys.length === 0) return []
  const first = graph.nodes.get(waypointKeys[0] as string)
  if (!first) return null
  if (waypointKeys.length === 1) return [first]

  const path: LonLat[] = []
  for (let i = 1; i < waypointKeys.length; i++) {
    const leg = findPath(
      graph,
      waypointKeys[i - 1] as string,
      waypointKeys[i] as string,
    )
    if (!leg) return null
    path.push(...(i === 1 ? leg : leg.slice(1)))
  }
  return path
}
