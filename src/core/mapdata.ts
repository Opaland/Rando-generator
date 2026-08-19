import type { Itinerary, LonLat, Network, Sample, Track } from './types.ts'

/** GeoJSON minimal — évite une dépendance de types externe dans core. */
export interface LineStringGeometry {
  type: 'LineString'
  coordinates: LonLat[]
}

export interface TrailProperties {
  network: Network
  itineraryId: number
  wayId: number
}

export interface LineFeature<P> {
  type: 'Feature'
  geometry: LineStringGeometry
  properties: P
}

export interface LineCollection<P> {
  type: 'FeatureCollection'
  features: LineFeature<P>[]
}

const NETWORK_PRIORITY: Record<Network, number> = { GR: 0, GRP: 1, PR: 2 }

function lineFeature<P>(coordinates: LonLat[], properties: P): LineFeature<P> {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties }
}

export interface TrailGeoJSON {
  /** Tous les ways (géométrie précise), pour le tracé « non parcouru ». */
  base: LineCollection<TrailProperties>
  /** Tronçons parcourus (suites d'échantillons faits, résolution STEP). */
  done: LineCollection<TrailProperties>
}

/**
 * Construit les couches carte : chaque way une fois (réseau le plus « fort »
 * s'il est partagé), et les tronçons parcourus regroupés par suites
 * d'échantillons faits consécutifs.
 */
export function buildTrailGeoJSON(
  itineraries: Itinerary[],
  samples: Sample[],
): TrailGeoJSON {
  // Way → propriétés (réseau prioritaire parmi les itinéraires le partageant).
  const wayProps = new Map<number, TrailProperties>()
  const wayCoords = new Map<number, LonLat[]>()
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      const existing = wayProps.get(way.osmWayId)
      if (
        !existing ||
        NETWORK_PRIORITY[itin.network] < NETWORK_PRIORITY[existing.network]
      ) {
        wayProps.set(way.osmWayId, {
          network: itin.network,
          itineraryId: itin.osmRelationId,
          wayId: way.osmWayId,
        })
      }
      if (!wayCoords.has(way.osmWayId)) {
        wayCoords.set(way.osmWayId, way.coords)
      }
    }
  }

  const base: LineFeature<TrailProperties>[] = []
  for (const [wayId, coords] of wayCoords) {
    if (coords.length < 2) continue
    base.push(lineFeature(coords, wayProps.get(wayId) as TrailProperties))
  }

  // Tronçons parcourus : suites d'échantillons faits consécutifs par way.
  const done: LineFeature<TrailProperties>[] = []
  let run: LonLat[] = []
  let runWayId: number | null = null
  const flush = () => {
    if (runWayId !== null && run.length >= 2) {
      done.push(lineFeature(run, wayProps.get(runWayId) as TrailProperties))
    }
    run = []
  }
  for (const sample of samples) {
    if (!sample.done || sample.wayId !== runWayId) flush()
    runWayId = sample.wayId
    if (sample.done) run.push([sample.lon, sample.lat])
  }
  flush()

  return {
    base: { type: 'FeatureCollection', features: base },
    done: { type: 'FeatureCollection', features: done },
  }
}

export interface TrackProperties {
  trackId: string
}

/** Traces GPX en surimpression (une feature par trace d'au moins 2 points). */
export function buildTracksGeoJSON(
  tracks: Track[],
): LineCollection<TrackProperties> {
  return {
    type: 'FeatureCollection',
    features: tracks
      .filter((t) => t.points.length >= 2)
      .map((t) => lineFeature(t.points, { trackId: t.id })),
  }
}
