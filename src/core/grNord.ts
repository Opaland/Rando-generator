import { polylineLengthMeters } from './sampling.ts'
import { isWgs84Coordinate } from './geo.ts'
import type { Itinerary, LonLat, SourceItineraire, TrailWay } from './types.ts'

/**
 * Le GR Nord, publié en open data par la Province Nord (Nouvelle-Calédonie)
 * sur data.gouv.nc — jeu « GR Province Nord », Licence Ouverte v2.0.
 *
 * C'est une **seconde** Grande Randonnée calédonienne, distincte du GR® NC1
 * (Prony → Dumbéa, sud) déjà présent dans OpenStreetMap sous `network=nwn` :
 * mesuré le 15/09, aucune des cinq étapes n'y apparaît. La demande « plus de
 * randonnées en Nouvelle-Calédonie » ne pouvait pas se répondre en
 * inventant un itinéraire — Sentiers n'affiche que des tracés réels — mais
 * ce jeu, lui, existe et est librement réutilisable : c'est la même voie que
 * les boucles de la Métropole de Lyon (`core/boucles.ts`), embarquée avec le
 * site plutôt qu'interrogée en direct.
 *
 * `network: 'GR'` parce que c'en est une, balisée blanc-rouge comme le NC1 —
 * mais la géométrie ne vient pas d'OSM, d'où `PROVINCE_NORD_ATTRIBUTION`
 * posée sur chaque itinéraire : sans elle, `gpxAttributionFor` créditerait
 * OpenStreetMap pour un tracé qu'il n'a jamais vu (le défaut de #87, pour un
 * réseau différent).
 */

const PRODUCTEUR = 'Province Nord'

export const PROVINCE_NORD_ATTRIBUTION: SourceItineraire = {
  author: PRODUCTEUR,
  license:
    'https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf',
}

/**
 * Ids hors de toute plage réelle : les relations OSM sont ~2×10⁷, les
 * boucles locales de Lyon montent depuis 2×10⁹ (`LOCAL_RELATION_ID_BASE`,
 * `core/boucles.ts`) avec au plus quelques centaines d'entrées. Cent
 * millions plus loin laisse une marge sans rapport avec ce que l'une ou
 * l'autre source pourra jamais compter.
 */
export const GR_NORD_RELATION_ID_BASE = 2_100_000_000
export const GR_NORD_WAY_ID_BASE = -1_100_000_000

interface EtapeFeature {
  type?: string
  properties?: Record<string, unknown> | null
  geometry?: { type?: string; coordinates?: unknown } | null
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Convertit le FeatureCollection (LineString, WGS84) en itinéraires GR.
 * Défensif de bout en bout, comme `parseBouclesGeoJSON` : une feature
 * malformée est écartée plutôt que de faire lever le parseur sur tout le
 * jeu.
 */
export function parseGrNordGeoJSON(
  data: unknown,
  fetchedAt: string,
): Itinerary[] {
  const features = (data as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return []

  const itineraries: Itinerary[] = []
  for (const raw of features as EtapeFeature[]) {
    const props = raw.properties ?? {}
    const objectid =
      typeof props.objectid === 'number' ? props.objectid : null
    if (objectid === null) continue

    const geometry = raw.geometry
    if (geometry?.type !== 'LineString') continue
    const coords = Array.isArray(geometry.coordinates)
      ? (geometry.coordinates as unknown[])
      : []
    if (coords.length < 2 || !coords.every(isWgs84Coordinate)) continue

    const way: TrailWay = {
      osmWayId: GR_NORD_WAY_ID_BASE - objectid,
      coords: (coords as unknown[]).map(
        (p) => [(p as LonLat)[0], (p as LonLat)[1]] as LonLat,
      ),
    }

    itineraries.push({
      osmRelationId: GR_NORD_RELATION_ID_BASE + objectid,
      ref: null,
      name: asStringOrNull(props.nom),
      network: 'GR',
      ways: [way],
      totalMeters: polylineLengthMeters(way.coords),
      fetchedAt,
      attribution: PROVINCE_NORD_ATTRIBUTION,
    })
  }
  return itineraries
}
