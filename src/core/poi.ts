import { fetchOverpass, type FetchOverpassOptions } from './overpass.ts'
import type { LonLat, PoiDetails, PoiKind, PointOfInterest } from './types.ts'

/**
 * Points d'intérêt le long d'un tracé, depuis OpenStreetMap.
 *
 * Deux pièges traités ici :
 *
 * 1. **Les refuges sont souvent des surfaces.** En montagne, un refuge est
 *    fréquemment cartographié comme le polygone du bâtiment, pas comme un
 *    nœud. On interroge donc `nwr` (nœuds, ways et relations) avec
 *    `out center`, qui fournit un centroïde exploitable pour les surfaces.
 * 2. **Un long GR déborde toute boîte englobante raisonnable.** Une bbox
 *    autour du GR 65 couvrirait un quart de la France : Overpass renverrait
 *    des milliers de POI hors sujet, ou abandonnerait. Le tracé est donc
 *    découpé en portions, chacune avec sa propre bbox.
 */

/** Marge ajoutée autour de chaque boîte englobante, en degrés (~1,5 km). */
const BBOX_MARGIN_DEG = 0.015

/** Étendue maximale d'une portion avant découpage, en degrés (~25 km). */
const MAX_SPAN_DEG = 0.25

/** Nombre maximal de portions : borne la taille de la requête. */
const MAX_CHUNKS = 40

/** Nombre maximal de POI demandés à Overpass. */
const MAX_POIS = 400

export interface BoundingBox {
  south: number
  west: number
  north: number
  east: number
}

function bboxOf(coords: LonLat[]): BoundingBox {
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

function evenSlices(coords: LonLat[], count: number): LonLat[][] {
  const size = Math.ceil(coords.length / count)
  const slices: LonLat[][] = []
  for (let i = 0; i < coords.length; i += size) {
    // Chevauchement d'un point : deux portions voisines ne laissent pas de
    // trou entre leurs boîtes englobantes.
    slices.push(coords.slice(i, Math.min(i + size + 1, coords.length)))
  }
  return slices
}

/**
 * Découpe un tracé en boîtes englobantes successives, chacune d'étendue
 * bornée. Au-delà de `maxChunks` portions, le tracé est redécoupé en parts
 * égales : les boîtes sont plus larges mais la couverture reste complète.
 */
export function bboxChunks(
  coords: LonLat[],
  maxSpanDeg = MAX_SPAN_DEG,
  maxChunks = MAX_CHUNKS,
): BoundingBox[] {
  if (coords.length === 0) {
    throw new Error('Impossible de calculer une boîte englobante sans point.')
  }

  const chunks: LonLat[][] = []
  let current: LonLat[] = []
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const point of coords) {
    const nextMinLon = Math.min(minLon, point[0])
    const nextMaxLon = Math.max(maxLon, point[0])
    const nextMinLat = Math.min(minLat, point[1])
    const nextMaxLat = Math.max(maxLat, point[1])
    const tooWide =
      current.length > 0 &&
      (nextMaxLon - nextMinLon > maxSpanDeg ||
        nextMaxLat - nextMinLat > maxSpanDeg)
    if (tooWide) {
      chunks.push(current)
      // La portion suivante repart du dernier point : pas de trou.
      current = [current[current.length - 1] as LonLat]
      minLon = maxLon = (current[0] as LonLat)[0]
      minLat = maxLat = (current[0] as LonLat)[1]
    }
    current.push(point)
    minLon = Math.min(minLon, point[0])
    maxLon = Math.max(maxLon, point[0])
    minLat = Math.min(minLat, point[1])
    maxLat = Math.max(maxLat, point[1])
  }
  if (current.length > 0) chunks.push(current)

  const bounded = chunks.length > maxChunks ? evenSlices(coords, maxChunks) : chunks
  return bounded.map(bboxOf)
}

/**
 * Requête Overpass : POI de randonnée le long du tracé.
 *
 * Les abris (`amenity=shelter`) sont filtrés par `shelter_type` dès la
 * requête : sans ça, un tracé urbain ramènerait tous les abribus.
 */
export function buildPoiQuery(coords: LonLat[]): string {
  const clauses = bboxChunks(coords)
    .map(({ south, west, north, east }) => {
      const bbox = `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`
      return [
        `  nwr["tourism"~"^(viewpoint|alpine_hut|wilderness_hut|picnic_site)$"](${bbox});`,
        `  nwr["natural"~"^(peak|spring|saddle)$"](${bbox});`,
        `  nwr["mountain_pass"="yes"](${bbox});`,
        `  nwr["amenity"="drinking_water"](${bbox});`,
        `  nwr["amenity"="shelter"]["shelter_type"~"^(basic_hut|lean_to|rock_shelter|weather_shelter)$"](${bbox});`,
        `  nwr["historic"~"^(monument|memorial|ruins|castle|fort|tower|archaeological_site|wayside_cross|wayside_shrine|boundary_stone)$"](${bbox});`,
        `  nwr["man_made"~"^(watermill|windmill)$"](${bbox});`,
      ].join('\n')
    })
    .join('\n')

  return `[out:json][timeout:60];
(
${clauses}
);
out center ${MAX_POIS};`
}

interface OverpassPoiElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  tags?: Record<string, string>
}

/**
 * Classe un élément OSM. Suit le wiki : un abri « météo » n'est pas prévu
 * pour la nuit, contrairement à une cabane ou un appentis — la nuance
 * compte pour qui cherche où dormir.
 */
function classify(tags: Record<string, string>): PoiKind | null {
  switch (tags.tourism) {
    case 'viewpoint':
      return 'viewpoint'
    case 'alpine_hut':
      return 'hut'
    case 'wilderness_hut':
      return 'bivouac'
    case 'picnic_site':
      return 'picnic'
  }
  if (tags.natural === 'peak') return 'peak'
  // Un col porte l'un ou l'autre tag selon les contributeurs — parfois les
  // deux, parfois seulement `mountain_pass` sur un nœud partagé avec la route.
  if (tags.natural === 'saddle' || tags.mountain_pass === 'yes') return 'pass'
  if (tags.natural === 'spring' || tags.amenity === 'drinking_water') {
    return 'water'
  }
  if (tags.amenity === 'shelter') {
    switch (tags.shelter_type) {
      case 'basic_hut':
      case 'lean_to':
      case 'rock_shelter':
        return 'bivouac'
      case 'weather_shelter':
        return 'shelter'
      default:
        // Abribus, abri de pique-nique… : hors sujet pour la randonnée.
        return null
    }
  }
  switch (tags.historic) {
    case 'monument':
    case 'memorial':
      return 'monument'
    case 'ruins':
    case 'castle':
    case 'fort':
    case 'tower':
    case 'archaeological_site':
      return 'ruins'
    case 'wayside_cross':
    case 'wayside_shrine':
    case 'boundary_stone':
      return 'marker'
  }
  // Moulins : ce qui reste des vallées d'avant, et qui se visite.
  if (tags.man_made === 'watermill' || tags.man_made === 'windmill') {
    return 'ruins'
  }
  return null
}

function trimmed(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function httpUrl(value: string | undefined): string | null {
  const url = trimmed(value)
  return url && /^https?:\/\//i.test(url) ? url : null
}

/**
 * Potabilité telle que déclarée. Rend `null` quand rien n'est dit : c'est le
 * cas le plus fréquent sur les sources, et il ne doit surtout pas être
 * confondu avec « non potable » — ni avec « potable ».
 */
function potabilite(tags: Record<string, string>): PoiDetails['drinkingWater'] {
  switch (tags.drinking_water) {
    case 'yes':
      return 'oui'
    case 'no':
      return 'non'
    case 'treated':
      return 'traitee'
    default:
      return null
  }
}

function detailsOf(tags: Record<string, string>): PoiDetails {
  return {
    phone: trimmed(tags.phone ?? tags['contact:phone']),
    website: httpUrl(tags.website ?? tags['contact:website']),
    capacity: trimmed(tags.capacity ?? tags['capacity:beds']),
    openingHours: trimmed(tags.opening_hours),
    operator: trimmed(tags.operator),
    elevation: trimmed(tags.ele),
    drinkingWater: potabilite(tags),
    seasonal: tags.seasonal === 'yes' || tags.intermittent === 'yes',
    spring: tags.natural === 'spring',
  }
}

/** Ordre d'affichage : ce qui sert à passer la nuit d'abord. */
const KIND_ORDER: PoiKind[] = [
  'bivouac',
  'hut',
  'shelter',
  'water',
  'pass',
  'peak',
  'viewpoint',
  'picnic',
  'ruins',
  'marker',
  'monument',
]

/**
 * Extrait les POI reconnus d'une réponse Overpass. Les surfaces (ways,
 * relations) sont acceptées via leur centroïde `center`.
 */
export function parsePoiResponse(data: unknown): PointOfInterest[] {
  const elements = (data as { elements?: OverpassPoiElement[] } | null)
    ?.elements
  if (!Array.isArray(elements)) return []

  const pois = new Map<string, PointOfInterest>()
  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat
    const lon = element.lon ?? element.center?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue
    const tags = element.tags ?? {}
    const kind = classify(tags)
    if (!kind) continue
    // Les portions se chevauchent : un même POI peut revenir plusieurs fois.
    const id = `${element.type}/${element.id}`
    if (pois.has(id)) continue
    pois.set(id, {
      id,
      lat,
      lon,
      kind,
      name: trimmed(tags.name),
      details: detailsOf(tags),
    })
  }

  return [...pois.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  )
}

/**
 * Récupère les points d'intérêt autour d'un tracé, ou `null` si la demande
 * n'a pas abouti.
 *
 * La distinction compte depuis qu'on peut emporter une randonnée (issue
 * #153) : `[]` veut dire « Overpass a répondu, il n'y a rien ici », `null`
 * veut dire « on n'a pas pu demander ». Les confondre — ce que faisait
 * `fetchPois` — ferait passer une panne de réseau pour un désert, et
 * priverait de sa réserve quelqu'un qui l'a constituée pour ce moment-là.
 */
export async function fetchPoisOuEchec(
  coords: LonLat[],
  options: FetchOverpassOptions = {},
): Promise<PointOfInterest[] | null> {
  try {
    const data = await fetchOverpass(buildPoiQuery(coords), options)
    return parsePoiResponse(data)
  } catch {
    return null
  }
}

/**
 * Récupère les points d'intérêt autour d'un tracé. Ne lève jamais d'erreur :
 * un POI est un bonus, jamais bloquant — en cas d'échec, tableau vide.
 *
 * Garde son nom là où l'appelant n'a rien à décider d'un échec, et délègue.
 */
export async function fetchPois(
  coords: LonLat[],
  options: FetchOverpassOptions = {},
): Promise<PointOfInterest[]> {
  return (await fetchPoisOuEchec(coords, options)) ?? []
}
