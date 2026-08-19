import {
  cellIndices,
  cellKeyFromIndices,
  distanceMeters,
  distanceToSegmentMeters,
} from './geo.ts'
import { sampleWay } from './sampling.ts'
import type {
  CompletionResult,
  Itinerary,
  LonLat,
  Network,
  Sample,
} from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * Le matching répond à une seule question : quelle part d'un itinéraire
 * l'utilisateur a-t-il réellement parcourue ? Trois garde-fous, chacun
 * corrigeant un faux résultat mesuré (voir tests/unit/matchingQuality.test.ts) :
 *
 * 1. **Distance au segment GPS**, pas au point GPS. Un appareil qui
 *    n'enregistre qu'un point tous les 500 m suit pourtant le sentier entre
 *    deux relevés ; l'ancienne version ne créditait que les abords des points.
 * 2. **Continuité** : un passage n'est crédité que s'il couvre plusieurs
 *    échantillons consécutifs. Couper un GR perpendiculairement ne le parcourt
 *    pas, et ne doit pas créditer les 200 m autour du croisement.
 * 3. **Confirmation de proximité** : un passage n'est crédité que si une part
 *    suffisante de ses échantillons est *nettement* plus proche que la
 *    tolérance. Marcher sur une route qui longe le GR à 30 m produit un écart
 *    constant, jamais la proximité franche d'un vrai passage — c'était le faux
 *    positif le plus grave, il créditait 100 % d'un sentier jamais foulé.
 */

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

/**
 * Au-delà de cet écart, deux points GPS successifs ne décrivent plus une
 * marche mais une coupure (trajet en voiture, appareil éteint) : le trajet
 * entre les deux n'est pas supposé parcouru.
 *
 * Le seuil est haut à dessein : certains appareils n'enregistrent qu'un point
 * toutes les quelques minutes, soit plusieurs centaines de mètres, sans que
 * la marche ait été interrompue. Faute d'horodatage par point (le parseur ne
 * le conserve pas), la distance est le seul critère disponible — un contrôle
 * de vitesse serait plus juste et reste à faire.
 */
export const MAX_GAP_METERS = 1_000

/** Échantillons consécutifs minimum pour créditer un passage (~300 m). */
export const MIN_RUN_SAMPLES = 3

/** Part de la tolérance en deçà de laquelle un échantillon est « confirmé ». */
export const CONFIRM_FACTOR = 0.4

/** Part minimale d'échantillons confirmés pour créditer un passage. */
export const CONFIRM_RATIO = 0.25

export interface MatchOptions {
  toleranceMeters: number
  stepMeters?: number
  /** Horodatage ISO des résultats — injecté pour garder la fonction pure. */
  computedAt: string
  minRunSamples?: number
  confirmRatio?: number
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

/** Segment de trace GPS ; a === b pour un point isolé. */
export interface TrackSegment {
  a: LonLat
  b: LonLat
}

/** Segments de la trace indexés par cellule de hachage spatial. */
export type TrackIndex = Map<string, TrackSegment[]>

function addToCells(index: TrackIndex, segment: TrackSegment): void {
  const [ax, ay] = cellIndices(segment.a[0], segment.a[1])
  const [bx, by] = cellIndices(segment.b[0], segment.b[1])
  for (let cx = Math.min(ax, bx); cx <= Math.max(ax, bx); cx++) {
    for (let cy = Math.min(ay, by); cy <= Math.max(ay, by); cy++) {
      const key = cellKeyFromIndices(cx, cy)
      const bucket = index.get(key)
      if (bucket) bucket.push(segment)
      else index.set(key, [segment])
    }
  }
}

/**
 * Indexe la trace GPS sous forme de segments. Les sauts de plus de
 * MAX_GAP_METERS sont conservés comme deux points isolés plutôt que comme un
 * segment : rien ne dit que l'utilisateur a marché entre les deux.
 */
export function buildTrackIndex(points: LonLat[]): TrackIndex {
  const index: TrackIndex = new Map()
  if (points.length === 0) return index
  if (points.length === 1) {
    const only = points[0] as LonLat
    addToCells(index, { a: only, b: only })
    return index
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as LonLat
    const b = points[i] as LonLat
    if (distanceMeters(a, b) > MAX_GAP_METERS) {
      addToCells(index, { a, b: a })
      addToCells(index, { a: b, b })
    } else {
      addToCells(index, { a, b })
    }
  }
  return index
}

/** Distance du point à la trace, en ne testant que les 9 cellules voisines. */
export function distanceToTrack(index: TrackIndex, point: LonLat): number {
  const [cx, cy] = cellIndices(point[0], point[1])
  let best = Infinity
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = index.get(cellKeyFromIndices(cx + dx, cy + dy))
      if (!bucket) continue
      for (const segment of bucket) {
        const distance = distanceToSegmentMeters(point, segment.a, segment.b)
        if (distance < best) best = distance
      }
    }
  }
  return best
}

/** Renseigne la distance de chaque échantillon à la trace, et un premier `done`. */
export function matchSamples(
  samples: Sample[],
  index: TrackIndex,
  toleranceMeters: number,
): void {
  for (const sample of samples) {
    const distance = distanceToTrack(index, [sample.lon, sample.lat])
    sample.distanceMeters = distance
    sample.done = distance <= toleranceMeters
  }
}

export interface ContinuityOptions {
  minRunSamples: number
  confirmMeters: number
  confirmRatio: number
}

/**
 * Invalide les passages trop courts ou jamais franchement proches du sentier.
 * Les échantillons d'un même way sont contigus et ordonnés (cf. buildSamples),
 * ce qui permet de raisonner par suites consécutives.
 */
export function applyContinuity(
  samples: Sample[],
  options: ContinuityOptions,
): void {
  const byWay = new Map<number, Sample[]>()
  for (const sample of samples) {
    const bucket = byWay.get(sample.wayId)
    if (bucket) bucket.push(sample)
    else byWay.set(sample.wayId, [sample])
  }

  for (const waySamples of byWay.values()) {
    // Un way plus court que le minimum ne doit pas devenir incréditable :
    // on exige alors simplement qu'il soit couvert en entier.
    const minRun = Math.min(options.minRunSamples, waySamples.length)
    let start = 0
    while (start < waySamples.length) {
      if (!(waySamples[start] as Sample).done) {
        start += 1
        continue
      }
      let end = start
      while (end + 1 < waySamples.length && (waySamples[end + 1] as Sample).done) {
        end += 1
      }
      const run = waySamples.slice(start, end + 1)
      const confirmed = run.filter(
        (sample) => (sample.distanceMeters ?? Infinity) <= options.confirmMeters,
      ).length
      const tooShort = run.length < minRun
      const neverClose = confirmed / run.length < options.confirmRatio
      if (tooShort || neverClose) {
        for (const sample of run) sample.done = false
      }
      start = end + 1
    }
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
    LOCAL: emptyStats(),
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

/** Pipeline complet : échantillonnage, index de segments, matching, continuité. */
export function runMatching(
  itineraries: Itinerary[],
  trackPoints: LonLat[],
  options: MatchOptions,
): MatchResult {
  const stepMeters = options.stepMeters ?? STEP_METERS
  const samples = buildSamples(itineraries, stepMeters)
  const index = buildTrackIndex(trackPoints)
  matchSamples(samples, index, options.toleranceMeters)
  applyContinuity(samples, {
    minRunSamples: options.minRunSamples ?? MIN_RUN_SAMPLES,
    confirmMeters: options.toleranceMeters * CONFIRM_FACTOR,
    confirmRatio: options.confirmRatio ?? CONFIRM_RATIO,
  })
  return {
    samples,
    ...computeCompletion(samples, itineraries, stepMeters, options.computedAt),
  }
}
