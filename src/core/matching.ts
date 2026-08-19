import { cellIndices, cellKeyFromIndices, distanceMeters } from './geo.ts'
import { sampleWay } from './sampling.ts'
import type {
  CompletionResult,
  Itinerary,
  LonLat,
  Network,
  Sample,
} from './types.ts'
import { STEP_METERS } from './types.ts'

export interface AggregateStats {
  doneMeters: number
  totalMeters: number
  pct: number
}

export interface MatchResult {
  samples: Sample[]
  results: CompletionResult[]
  /** Totaux toutes randos, chaque way partagé compté une seule fois. */
  global: AggregateStats
  byNetwork: Record<Network, AggregateStats>
}

export interface MatchOptions {
  toleranceMeters: number
  stepMeters?: number
  /** Horodatage ISO des résultats — injecté pour garder la fonction pure. */
  computedAt: string
}

/**
 * Échantillonne les ways de tous les itinéraires, en dédupliquant par way id :
 * un way partagé est échantillonné une fois et rattaché à chaque itinéraire.
 */
export function buildSamples(
  itineraries: Itinerary[],
  stepMeters: number,
): Sample[] {
  const byWay = new Map<number, { coords: LonLat[]; itineraryIds: number[] }>()
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      const entry = byWay.get(way.osmWayId)
      if (entry) {
        if (!entry.itineraryIds.includes(itin.osmRelationId)) {
          entry.itineraryIds.push(itin.osmRelationId)
        }
      } else {
        byWay.set(way.osmWayId, {
          coords: way.coords,
          itineraryIds: [itin.osmRelationId],
        })
      }
    }
  }

  const samples: Sample[] = []
  for (const [wayId, { coords, itineraryIds }] of byWay) {
    for (const [lon, lat] of sampleWay(coords, stepMeters)) {
      samples.push({ lon, lat, wayId, itineraryIds, done: false })
    }
  }
  return samples
}

/** Indexe les points GPX par cellule de hachage spatial. */
export function buildPointIndex(points: LonLat[]): Map<string, LonLat[]> {
  const index = new Map<string, LonLat[]>()
  for (const point of points) {
    const key = cellKeyFromIndices(...cellIndices(point[0], point[1]))
    const bucket = index.get(key)
    if (bucket) {
      bucket.push(point)
    } else {
      index.set(key, [point])
    }
  }
  return index
}

/**
 * Marque `done` chaque échantillon ayant au moins un point GPX à moins de
 * `toleranceMeters`, en ne testant que les 9 cellules voisines.
 */
export function matchSamples(
  samples: Sample[],
  index: Map<string, LonLat[]>,
  toleranceMeters: number,
): void {
  for (const sample of samples) {
    const [cx, cy] = cellIndices(sample.lon, sample.lat)
    const samplePos: LonLat = [sample.lon, sample.lat]
    let done = false
    for (let dx = -1; dx <= 1 && !done; dx++) {
      for (let dy = -1; dy <= 1 && !done; dy++) {
        const bucket = index.get(cellKeyFromIndices(cx + dx, cy + dy))
        if (!bucket) continue
        for (const point of bucket) {
          if (distanceMeters(samplePos, point) <= toleranceMeters) {
            done = true
            break
          }
        }
      }
    }
    sample.done = done
  }
}

function emptyStats(): AggregateStats {
  return { doneMeters: 0, totalMeters: 0, pct: 0 }
}

function finalizePct(stats: AggregateStats): void {
  stats.pct =
    stats.totalMeters === 0 ? 0 : (stats.doneMeters / stats.totalMeters) * 100
}

/**
 * Agrège les échantillons matés en résultats : par itinéraire, globaux
 * (way partagé compté une fois) et par réseau.
 */
export function computeCompletion(
  samples: Sample[],
  itineraries: Itinerary[],
  stepMeters: number,
  computedAt: string,
): Omit<MatchResult, 'samples'> {
  const perItinerary = new Map<number, { done: number; total: number }>()
  for (const itin of itineraries) {
    perItinerary.set(itin.osmRelationId, { done: 0, total: 0 })
  }
  const networkOf = new Map<number, Network>(
    itineraries.map((itin) => [itin.osmRelationId, itin.network]),
  )

  const global = emptyStats()
  const byNetwork: Record<Network, AggregateStats> = {
    GR: emptyStats(),
    GRP: emptyStats(),
    PR: emptyStats(),
    PERSO: emptyStats(),
  }

  for (const sample of samples) {
    global.totalMeters += stepMeters
    if (sample.done) global.doneMeters += stepMeters

    const seenNetworks = new Set<Network>()
    for (const itineraryId of sample.itineraryIds) {
      const counts = perItinerary.get(itineraryId)
      if (counts) {
        counts.total += 1
        if (sample.done) counts.done += 1
      }
      const network = networkOf.get(itineraryId)
      if (network && !seenNetworks.has(network)) {
        seenNetworks.add(network)
        byNetwork[network].totalMeters += stepMeters
        if (sample.done) byNetwork[network].doneMeters += stepMeters
      }
    }
  }

  finalizePct(global)
  for (const network of Object.keys(byNetwork) as Network[]) {
    finalizePct(byNetwork[network])
  }

  const results: CompletionResult[] = itineraries.map((itin) => {
    const counts = perItinerary.get(itin.osmRelationId) ?? {
      done: 0,
      total: 0,
    }
    return {
      itineraryId: itin.osmRelationId,
      doneMeters: counts.done * stepMeters,
      totalMeters: counts.total * stepMeters,
      pct: counts.total === 0 ? 0 : (counts.done / counts.total) * 100,
      computedAt,
    }
  })

  return { results, global, byNetwork }
}

/** Pipeline complet : échantillonnage, index spatial, matching, agrégation. */
export function runMatching(
  itineraries: Itinerary[],
  trackPoints: LonLat[],
  options: MatchOptions,
): MatchResult {
  const stepMeters = options.stepMeters ?? STEP_METERS
  const samples = buildSamples(itineraries, stepMeters)
  const index = buildPointIndex(trackPoints)
  matchSamples(samples, index, options.toleranceMeters)
  return {
    samples,
    ...computeCompletion(samples, itineraries, stepMeters, options.computedAt),
  }
}
