import { fetchOverpass, type FetchOverpassOptions } from './overpass.ts'
import type { LonLat, PoiKind, PointOfInterest } from './types.ts'

/** Tags OSM retenus, mappés vers nos catégories d'affichage. */
const TAG_TO_KIND: [tag: string, value: string, kind: PoiKind][] = [
  ['tourism', 'viewpoint', 'viewpoint'],
  ['natural', 'peak', 'peak'],
  ['tourism', 'alpine_hut', 'hut'],
  ['tourism', 'wilderness_hut', 'hut'],
  ['amenity', 'drinking_water', 'water'],
  ['natural', 'spring', 'water'],
  ['tourism', 'picnic_site', 'picnic'],
  ['historic', 'monument', 'monument'],
  ['historic', 'memorial', 'monument'],
]

/** Marge ajoutée autour de la boîte englobante du tracé, en degrés (~1,5 km). */
const BBOX_MARGIN_DEG = 0.015

function boundingBox(
  coords: LonLat[],
): { south: number; west: number; north: number; east: number } {
  if (coords.length === 0) {
    throw new Error('Impossible de calculer une boîte englobante sans point.')
  }
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const [lon, lat] of coords) {
    south = Math.min(south, lat)
    north = Math.max(north, lat)
    west = Math.min(west, lon)
    east = Math.max(east, lon)
  }
  return {
    south: south - BBOX_MARGIN_DEG,
    west: west - BBOX_MARGIN_DEG,
    north: north + BBOX_MARGIN_DEG,
    east: east + BBOX_MARGIN_DEG,
  }
}

/**
 * Requête Overpass : points d'intérêt de randonnée (points de vue, sommets,
 * refuges, points d'eau, aires de pique-nique, monuments) dans la boîte
 * englobante d'un tracé, avec une marge.
 */
export function buildPoiQuery(coords: LonLat[]): string {
  const { south, west, north, east } = boundingBox(coords)
  const bbox = `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`
  const filters = TAG_TO_KIND.map(([tag, value]) => `["${tag}"="${value}"]`)
  const clauses = filters.map((filter) => `  node${filter}(${bbox});`).join('\n')
  return `[out:json][timeout:25];
(
${clauses}
);
out body;`
}

interface OverpassPoiElement {
  type: string
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

function classify(tags: Record<string, string>): PoiKind | null {
  for (const [tag, value, kind] of TAG_TO_KIND) {
    if (tags[tag] === value) return kind
  }
  return null
}

/** Extrait les points d'intérêt reconnus d'une réponse Overpass. */
export function parsePoiResponse(data: unknown): PointOfInterest[] {
  const elements = (data as { elements?: OverpassPoiElement[] } | null)
    ?.elements
  if (!Array.isArray(elements)) return []

  const pois: PointOfInterest[] = []
  for (const element of elements) {
    if (
      element.type !== 'node' ||
      typeof element.lat !== 'number' ||
      typeof element.lon !== 'number'
    ) {
      continue
    }
    const tags = element.tags ?? {}
    const kind = classify(tags)
    if (!kind) continue
    pois.push({
      id: element.id,
      lat: element.lat,
      lon: element.lon,
      kind,
      name: tags.name ?? null,
    })
  }
  return pois
}

/**
 * Récupère les points d'intérêt autour d'un tracé. Ne lève jamais d'erreur :
 * un POI est un bonus, jamais bloquant — en cas d'échec, tableau vide.
 */
export async function fetchPois(
  coords: LonLat[],
  options: FetchOverpassOptions = {},
): Promise<PointOfInterest[]> {
  try {
    const data = await fetchOverpass(buildPoiQuery(coords), options)
    return parsePoiResponse(data)
  } catch {
    return []
  }
}
