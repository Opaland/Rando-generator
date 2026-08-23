import { slicePolyline } from './sampling.ts'
import type { Itinerary, LonLat, Network, Sample, Track } from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * Concatène les coordonnées de tous les ways d'un itinéraire, dans l'ordre
 * des membres — approximation raisonnable pour un profil altimétrique ou une
 * boîte englobante (l'ordre des membres d'une relation OSM entretenue suit
 * généralement le sens de l'itinéraire).
 */
export function itineraryCoords(itinerary: Itinerary): LonLat[] {
  return itinerary.ways.flatMap((way) => way.coords)
}

/** GeoJSON minimal — évite une dépendance de types externe dans core. */
export interface LineStringGeometry {
  type: 'LineString'
  coordinates: LonLat[]
}

export interface TrailProperties {
  network: Network
  /** Itinéraire « principal » du way (réseau prioritaire), pour le clic. */
  itineraryId: number
  /** Tous les itinéraires passant par ce way, pour le surlignage. */
  itineraryIds: number[]
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

const NETWORK_PRIORITY: Record<Network, number> = {
  GR: 0,
  GRP: 1,
  PR: 2,
  LOCAL: 3,
  PERSO: 4,
}

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
  stepMeters: number = STEP_METERS,
): TrailGeoJSON {
  // Way → propriétés (réseau prioritaire parmi les itinéraires le partageant).
  const wayProps = new Map<number, TrailProperties>()
  const wayCoords = new Map<number, LonLat[]>()
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      const existing = wayProps.get(way.osmWayId)
      if (!existing) {
        wayProps.set(way.osmWayId, {
          network: itin.network,
          itineraryId: itin.osmRelationId,
          itineraryIds: [itin.osmRelationId],
          wayId: way.osmWayId,
        })
      } else {
        if (!existing.itineraryIds.includes(itin.osmRelationId)) {
          existing.itineraryIds.push(itin.osmRelationId)
        }
        if (NETWORK_PRIORITY[itin.network] < NETWORK_PRIORITY[existing.network]) {
          existing.network = itin.network
          existing.itineraryId = itin.osmRelationId
        }
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
  //
  // La portion colorée suit la **géométrie réelle du chemin** entre le
  // premier et le dernier échantillon de la suite, au lieu de relier les
  // échantillons entre eux. Le trait droit coupait les lacets : dans une
  // épingle de montagne, plus courte que le pas d'échantillonnage, il passait
  // à travers le virage (issue #142).
  //
  // Les échantillons d'un way sont posés tous les `stepMeters` depuis son
  // départ (cf. sampleWay) : le k-ième est donc à k × pas du début, ce qui
  // suffit à retrouver la portion sans stocker d'index supplémentaire.
  const done: LineFeature<TrailProperties>[] = []
  const rangs = new Map<number, number>()
  let runWayId: number | null = null
  let runDebut: number | null = null
  let runFin: number | null = null
  const flush = () => {
    if (runWayId !== null && runDebut !== null && runFin !== null) {
      const coords = wayCoords.get(runWayId)
      const portion = coords
        ? slicePolyline(coords, runDebut * stepMeters, runFin * stepMeters)
        : []
      if (portion.length >= 2) {
        done.push(
          lineFeature(portion, wayProps.get(runWayId) as TrailProperties),
        )
      }
    }
    runDebut = null
    runFin = null
  }
  for (const sample of samples) {
    const rang = rangs.get(sample.wayId) ?? 0
    rangs.set(sample.wayId, rang + 1)
    if (!sample.done || sample.wayId !== runWayId) flush()
    runWayId = sample.wayId
    if (sample.done) {
      runDebut ??= rang
      runFin = rang
    }
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
/**
 * Les itinéraires déclarés parcourus, pour la carte (issue #158).
 *
 * Le figuré retenu est le trait **discontinu**, dans la couleur de son
 * réseau : mesuré = plein, déclaré = pointillé. Le style s'en charge ; ici on
 * ne produit que la géométrie et le réseau.
 *
 * Pourquoi le figuré et non une couleur : l'audit global avait relevé deux
 * jetons de couleur nés entre deux sprints sans que personne les ait
 * décidés, et une couleur de plus se disputerait la lecture avec les cinq
 * couleurs de réseau — qui, elles, portent déjà une information.
 *
 * Cette collection est **la seule** chose que le déclaratif ajoute à la
 * carte. Elle ne passe pas par `Sample`, donc rien de ce qui suppose une
 * géométrie mesurée ne peut s'en nourrir.
 */
export function buildDeclaresGeoJSON(
  itineraries: Itinerary[],
  declares: { itineraryId: number }[],
): LineCollection<TrailProperties> {
  const coches = new Set(declares.map((d) => d.itineraryId))
  const features: LineFeature<TrailProperties>[] = []
  for (const itin of itineraries) {
    if (!coches.has(itin.osmRelationId)) continue
    for (const way of itin.ways) {
      // Un point isolé n'est pas une ligne : MapLibre refuserait la
      // géométrie, et la couche entière disparaîtrait avec elle.
      if (way.coords.length < 2) continue
      features.push(
        lineFeature(way.coords, {
          network: itin.network,
          itineraryId: itin.osmRelationId,
          itineraryIds: [itin.osmRelationId],
          wayId: way.osmWayId,
        }),
      )
    }
  }
  return { type: 'FeatureCollection', features }
}

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
