import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary, LonLat, TrailWay } from './types.ts'
import { lienSortant } from './lienSortant.ts'

/**
 * Boucles de randonnée locales issues de l'open data des collectivités —
 * aujourd'hui le jeu « Boucles communales de randonnée de la Métropole de
 * Lyon » (Licence Ouverte 2.0, © Métropole de Lyon). Ce ne sont PAS des PR®
 * FFRandonnée : elles forment le réseau LOCAL, avec leur propre couleur.
 */

/** Producteur de la donnée, pour l'attribution obligatoire (LO 2.0). */
const BOUCLES_SOURCE = 'Métropole de Lyon'

/**
 * Ids hors de toute plage réelle : les relations OSM sont ~2×10⁷, les ways
 * OSM ~1,3×10⁹ (positifs), les itinéraires persos descendent de -1. Les
 * boucles montent depuis 2×10⁹ (relations) et descendent depuis -10⁶ (ways).
 */
export const LOCAL_RELATION_ID_BASE = 2_000_000_000
export const LOCAL_WAY_ID_BASE = -1_000_000
const WAYS_PER_BOUCLE = 100

interface BoucleFeature {
  type?: string
  properties?: Record<string, unknown> | null
  geometry?: { type?: string; coordinates?: unknown } | null
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * La règle vit dans `core/lienSortant.ts` depuis la revue globale du 25/08 :
 * elle était recopiée ici et dans `poi.ts`, et **absente** de l'import de
 * sauvegarde — un trou structurel, pas un oubli. Voir l'en-tête de ce module.
 */
function asHttpUrlOrNull(value: unknown): string | null {
  return lienSortant(asStringOrNull(value))
}

function isLonLat(value: unknown): value is LonLat {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  )
}

/**
 * Convertit un FeatureCollection de boucles (MultiLineString, WGS84) en
 * itinéraires LOCAL. Défensif de bout en bout : une donnée malformée (champ
 * manquant, ligne dégénérée, coordonnées non reprojetées type Lambert 93)
 * écarte la feature concernée sans jamais lever.
 */
export function parseBouclesGeoJSON(
  data: unknown,
  fetchedAt: string,
): Itinerary[] {
  const features = (data as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return []

  const itineraries: Itinerary[] = []
  for (const raw of features as BoucleFeature[]) {
    const props = raw.properties ?? {}
    const gid = typeof props.gid === 'number' ? props.gid : null
    if (gid === null) continue

    const geometry = raw.geometry
    if (geometry?.type !== 'MultiLineString') continue
    const lines = Array.isArray(geometry.coordinates)
      ? (geometry.coordinates as unknown[])
      : []

    const ways: TrailWay[] = []
    for (const [lineIndex, line] of lines.entries()) {
      if (!Array.isArray(line) || line.length < 2) continue
      if (!line.every(isLonLat)) continue
      ways.push({
        osmWayId: LOCAL_WAY_ID_BASE - gid * WAYS_PER_BOUCLE - lineIndex,
        coords: line.map((p) => [p[0], p[1]] as LonLat),
      })
    }
    if (ways.length === 0) continue

    itineraries.push({
      osmRelationId: LOCAL_RELATION_ID_BASE + gid,
      ref: null,
      name: asStringOrNull(props.nom),
      network: 'LOCAL',
      ways,
      // Longueur calculée depuis la géométrie : le champ « longueur » de la
      // source est une chaîne française en kilomètres (« 10,2  »), fragile.
      totalMeters: ways.reduce(
        (sum, w) => sum + polylineLengthMeters(w.coords),
        0,
      ),
      fetchedAt,
      details: {
        source: BOUCLES_SOURCE,
        commune: asStringOrNull(props.commune_depart),
        difficulte: asStringOrNull(props.difficulte),
        temps: asStringOrNull(props.temps),
        denivele: asStringOrNull(props.denivele),
        descriptif: asStringOrNull(props.descriptif),
        lienWeb: asHttpUrlOrNull(props.lien_web),
      },
    })
  }
  return itineraries
}
