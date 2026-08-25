import { slicePolyline } from './sampling.ts'
import { chainWays } from './chainage.ts'
import type { Itinerary, LonLat, Network, Sample, Track } from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * La géométrie d'un itinéraire, **dans l'ordre de la marche** (issue #303).
 *
 * ## Ce que cette fonction rendait avant, et pourquoi c'était faux
 *
 * Elle concaténait les ways dans l'ordre des membres, sous un commentaire
 * qui appelait ça une « approximation raisonnable », au motif que « l'ordre
 * des membres d'une relation OSM entretenue suit généralement le sens de
 * l'itinéraire ».
 *
 * Cette phrase n'a jamais été mesurée. Sur trois tronçons **contigus**
 * donnés dans l'ordre quelconque d'OSM, l'un décrit à l'envers — le cas
 * ordinaire, pas un cas tordu — l'ancienne version rendait **10 931 m** là
 * où l'itinéraire en fait **4 685**. Le profil altimétrique montrait des
 * montées et des descentes qui n'existaient pas : c'étaient les
 * allers-retours d'un bout à l'autre du tracé, échantillonnés en ligne
 * droite.
 *
 * C'est le §4bis dans sa forme la plus coûteuse — une justification qui
 * excuse une approximation, et que personne ne relit.
 *
 * ## Ce que le chaînage ne prétend pas
 *
 * Il ne répare pas une relation trouée : ce que `chainWays` ne peut pas
 * raccrocher est ajouté à la suite, pour ne perdre aucun kilomètre, et le
 * saut compte dans l'axe — c'est une distance qu'on parcourt en ligne droite
 * sur le graphique. `core/dataQuality.ts` la mesure et la fiche la dit.
 *
 * `tests/unit/axeDesDistances.test.ts` asserte l'accord des trois axes —
 * celui-ci, celui des bandes de terrain et celui des étapes — plutôt qu'un
 * nombre recopié : un nombre vieillit, un accord non.
 */
function memePoint(a: LonLat | undefined, b: LonLat | undefined): boolean {
  if (!a || !b) return false
  return a[0] === b[0] && a[1] === b[1]
}

export function itineraryCoords(itinerary: Itinerary): LonLat[] {
  const parId = new Map(itinerary.ways.map((way) => [way.osmWayId, way]))
  const coords: LonLat[] = []
  for (const maillon of chainWays(itinerary.ways)) {
    const way = parId.get(maillon.wayId)
    if (!way) continue
    const points = maillon.reversed ? [...way.coords].reverse() : way.coords
    /*
      On ne répète pas le point de jonction quand deux tronçons se touchent :
      un doublon ne change pas la longueur, mais il fait une marche de zéro
      mètre dans l'échantillonnage du profil, et deux relevés d'altitude au
      même endroit.
    */
    const debut =
      coords.length > 0 && memePoint(coords[coords.length - 1], points[0])
        ? 1
        : 0
    for (let i = debut; i < points.length; i += 1) {
      coords.push(points[i] as LonLat)
    }
  }
  return coords
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
  /*
    Le plus petit nombre gagne la couleur d'un chemin partagé. `INCONNU`
    ferme donc la marche : un tronçon emprunté à la fois par un GR et par une
    relation sans réseau déclaré se peint en GR. Le contraire ferait perdre
    une information certaine au profit d'une absence d'information.
  */
  PERSO: 4,
  INCONNU: 5,
}

function lineFeature<P>(coordinates: LonLat[], properties: P): LineFeature<P> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties,
  }
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
        if (
          NETWORK_PRIORITY[itin.network] < NETWORK_PRIORITY[existing.network]
        ) {
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
