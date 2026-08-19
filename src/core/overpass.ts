import { classifyNetwork } from './network.ts'
import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary, LonLat, TrailWay } from './types.ts'

/** Erreur Overpass, message affichable tel quel à l'utilisateur. */
export class OverpassError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OverpassError'
  }
}

export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const

export const OVERPASS_TIMEOUT_MS = 180_000

export interface OverpassZone {
  id: string
  label: string
  areaSelectors: string[]
}

const RHONE_SELECTORS = [
  'area["boundary"="administrative"]["admin_level"="6"]["name"="Rhône"]',
  'area["boundary"="administrative"]["admin_level"="6"]["name"="Métropole de Lyon"]',
]
const LOIRE_SELECTORS = [
  'area["boundary"="administrative"]["admin_level"="6"]["name"="Loire"]',
]
const PILAT_SELECTORS = [
  'area["boundary"="protected_area"]["name"="Parc naturel régional du Pilat"]',
]

/** Zones prédéfinies proposées dans l'UI. */
export const ZONES: OverpassZone[] = [
  {
    id: 'rhone',
    label: 'Rhône + Métropole de Lyon',
    areaSelectors: RHONE_SELECTORS,
  },
  { id: 'loire', label: 'Loire', areaSelectors: LOIRE_SELECTORS },
  { id: 'pilat', label: 'PNR du Pilat', areaSelectors: PILAT_SELECTORS },
  {
    id: 'trois',
    label: 'Les trois',
    areaSelectors: [...RHONE_SELECTORS, ...LOIRE_SELECTORS, ...PILAT_SELECTORS],
  },
]

/** Requête Overpass : toutes les relations route=hiking d'une zone prédéfinie. */
export function buildZoneQuery(zoneId: string): string {
  const zone = ZONES.find((z) => z.id === zoneId)
  if (!zone) {
    throw new OverpassError(`Zone inconnue : ${zoneId}`)
  }
  const areas = zone.areaSelectors.map((s) => `  ${s};`).join('\n')
  return `[out:json][timeout:180];
(
${areas}
)->.zone;
relation["route"="hiking"](area.zone);
out geom;`
}

/**
 * Requête Overpass : relations route=hiking par ref (ex. « GR 20 »), en France,
 * insensible à la casse et tolérante sur les espaces. Les métacaractères de
 * regex sont échappés (doublement : une fois pour la regex, une fois pour la
 * chaîne Overpass QL).
 */
export function buildRefQuery(ref: string): string {
  const escaped = ref
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')
    .replace(/\s+/g, ' ?')
  return `[out:json][timeout:180];
area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;
relation["route"="hiking"]["ref"~"^${escaped}$",i](area.fr);
out geom;`
}

interface OverpassMember {
  type: string
  ref: number
  role?: string
  geometry?: { lat: number; lon: number }[]
}

interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  members?: OverpassMember[]
}

export interface OverpassResponse {
  elements: OverpassElement[]
}

function isOverpassResponse(data: unknown): data is OverpassResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { elements?: unknown }).elements)
  )
}

/**
 * Convertit une réponse Overpass (relations avec `out geom`) en itinéraires.
 * Les membres non-way ou sans géométrie sont ignorés, les ways répétés dans
 * une relation sont dédupliqués, les relations sans géométrie sont écartées.
 */
export function parseOverpassResponse(
  data: OverpassResponse,
  fetchedAt: string,
): Itinerary[] {
  const itineraries: Itinerary[] = []
  for (const element of data.elements) {
    if (element.type !== 'relation') continue
    const seenWayIds = new Set<number>()
    const ways: TrailWay[] = []
    for (const member of element.members ?? []) {
      if (member.type !== 'way' || !member.geometry) continue
      if (seenWayIds.has(member.ref)) continue
      seenWayIds.add(member.ref)
      const coords: LonLat[] = member.geometry.map((g) => [g.lon, g.lat])
      ways.push({ osmWayId: member.ref, coords })
    }
    if (ways.length === 0) continue

    const tags = element.tags ?? {}
    itineraries.push({
      osmRelationId: element.id,
      ref: tags.ref ?? null,
      name: tags.name ?? null,
      network: classifyNetwork(tags),
      ways,
      totalMeters: ways.reduce(
        (sum, w) => sum + polylineLengthMeters(w.coords),
        0,
      ),
      fetchedAt,
    })
  }
  return itineraries
}

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export interface FetchOverpassOptions {
  fetchFn?: FetchLike
  mirrors?: readonly string[]
  timeoutMs?: number
}

/**
 * Interroge Overpass en POST, en essayant chaque miroir dans l'ordre.
 * Résout avec le JSON brut (à passer à parseOverpassResponse), rejette avec
 * une OverpassError en français si tous les miroirs échouent.
 */
export async function fetchOverpass(
  query: string,
  options: FetchOverpassOptions = {},
): Promise<OverpassResponse> {
  const fetchFn: FetchLike =
    options.fetchFn ?? ((url, init) => fetch(url, init))
  const mirrors = options.mirrors ?? OVERPASS_MIRRORS
  const timeoutMs = options.timeoutMs ?? OVERPASS_TIMEOUT_MS

  for (const mirror of mirrors) {
    try {
      const response = await fetchFn(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) continue
      const data: unknown = await response.json()
      if (isOverpassResponse(data)) return data
    } catch {
      // Miroir injoignable ou réponse illisible : on tente le suivant.
    }
  }

  throw new OverpassError(
    'Impossible de joindre les serveurs de données OpenStreetMap (Overpass). ' +
      'Ils sont peut-être surchargés : réessayez dans quelques minutes.',
  )
}
