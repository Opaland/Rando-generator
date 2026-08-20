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

/** Regroupement des zones dans l'UI. */
export type ZoneGroup = 'proche' | 'aura'

export interface OverpassZone {
  id: string
  label: string
  areaSelectors: string[]
  group: ZoneGroup
}

/** Sélecteur de département (ou collectivité à statut particulier) par nom OSM. */
function departementSelector(name: string): string {
  return `area["boundary"="administrative"]["admin_level"="6"]["name"="${name}"]`
}

const RHONE_SELECTORS = [
  departementSelector('Rhône'),
  departementSelector('Métropole de Lyon'),
]
const LOIRE_SELECTORS = [departementSelector('Loire')]
const PILAT_SELECTORS = [
  'area["boundary"="protected_area"]["name"="Parc naturel régional du Pilat"]',
]

/**
 * Départements d'Auvergne-Rhône-Alpes, hors Rhône et Loire déjà proposés
 * ci-dessus. Chargés un par un : une requête couvrant toute la région
 * dépasserait le délai d'Overpass et le quota de stockage du navigateur.
 */
const AURA_DEPARTEMENTS: { id: string; label: string; name: string }[] = [
  { id: 'ain', label: 'Ain', name: 'Ain' },
  { id: 'allier', label: 'Allier', name: 'Allier' },
  { id: 'ardeche', label: 'Ardèche', name: 'Ardèche' },
  { id: 'cantal', label: 'Cantal', name: 'Cantal' },
  { id: 'drome', label: 'Drôme', name: 'Drôme' },
  { id: 'isere', label: 'Isère', name: 'Isère' },
  { id: 'haute-loire', label: 'Haute-Loire', name: 'Haute-Loire' },
  { id: 'puy-de-dome', label: 'Puy-de-Dôme', name: 'Puy-de-Dôme' },
  { id: 'savoie', label: 'Savoie', name: 'Savoie' },
  { id: 'haute-savoie', label: 'Haute-Savoie', name: 'Haute-Savoie' },
]

/** Zones prédéfinies proposées dans l'UI. */
export const ZONES: OverpassZone[] = [
  {
    id: 'rhone',
    label: 'Rhône + Métropole de Lyon',
    areaSelectors: RHONE_SELECTORS,
    group: 'proche',
  },
  { id: 'loire', label: 'Loire', areaSelectors: LOIRE_SELECTORS, group: 'proche' },
  {
    id: 'pilat',
    label: 'PNR du Pilat',
    areaSelectors: PILAT_SELECTORS,
    group: 'proche',
  },
  {
    id: 'trois',
    label: 'Les trois',
    areaSelectors: [...RHONE_SELECTORS, ...LOIRE_SELECTORS, ...PILAT_SELECTORS],
    group: 'proche',
  },
  ...AURA_DEPARTEMENTS.map((dept) => ({
    id: dept.id,
    label: dept.label,
    areaSelectors: [departementSelector(dept.name)],
    group: 'aura' as const,
  })),
]

/** Grand itinéraire mis en avant, chargé par sa ref (recherche France entière). */
export interface FeaturedRoute {
  ref: string
  label: string
  hint: string
}

/**
 * Quelques grands itinéraires proposés en un clic : ils traversent plusieurs
 * départements, donc aucune zone ne les contient entièrement — ils passent
 * par la recherche par ref, qui interroge toute la France.
 */
export const FEATURED_ROUTES: FeaturedRoute[] = [
  { ref: 'GR 65', label: 'GR 65', hint: 'Chemin de Saint-Jacques (voie du Puy)' },
  { ref: 'GR 70', label: 'GR 70', hint: 'Chemin de Stevenson' },
  { ref: 'GR 5', label: 'GR 5', hint: 'Grande Traversée des Alpes' },
  { ref: 'GR 7', label: 'GR 7', hint: 'Vosges → Pyrénées, par le Pilat' },
  { ref: 'GR 4', label: 'GR 4', hint: 'Méditerranée → Océan, par l’Auvergne' },
  { ref: 'GR 3', label: 'GR 3', hint: 'Le sentier de la Loire' },
]

/**
 * Types de relations retenus : hiking (GR, GRP, la plupart des PR), mais aussi
 * foot/walking — en France beaucoup de boucles locales balisées (cartoguides
 * départementaux, sentiers métropolitains) sont taguées route=foot — et
 * pilgrimage, sous lequel sont parfois cartographiés les chemins de
 * Saint-Jacques et autres itinéraires de pèlerinage.
 */
const ROUTE_FILTER = '["route"~"^(hiking|foot|walking|pilgrimage)$"]'

/** Requête Overpass : toutes les relations d'itinéraires pédestres d'une zone. */
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
relation${ROUTE_FILTER}(area.zone);
out meta geom;`
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
relation${ROUTE_FILTER}["ref"~"^${escaped}$",i](area.fr);
out meta geom;`
}

/**
 * Rayon d'une recherche « autour d'un lieu ».
 *
 * Une commune n'est pas une zone Overpass, et ses limites administratives ne
 * disent rien de l'endroit où l'on marche : on part du centre et on prend
 * douze kilomètres, la portée d'une sortie à la journée depuis chez soi. Plus
 * large ferait une requête lourde pour des sentiers qu'on n'ira pas voir.
 */
export const RAYON_AUTOUR_METERS = 12_000

/**
 * Requête Overpass : les itinéraires pédestres dans un rayon autour d'un point.
 *
 * Attention à l'ordre : Overpass attend `(around:rayon,lat,lon)`, quand le
 * GeoJSON — et donc `LonLat` — donne la longitude d'abord.
 */
export function buildAroundQuery(
  center: LonLat,
  radiusMeters: number = RAYON_AUTOUR_METERS,
): string {
  const [lon, lat] = center
  return `[out:json][timeout:180];
relation${ROUTE_FILTER}(around:${String(Math.round(radiusMeters))},${lat.toFixed(6)},${lon.toFixed(6)});
out meta geom;`
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
  /** Dernière modification de la relation dans OSM (`out meta`). */
  timestamp?: string
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
      osmUpdatedAt: element.timestamp ?? null,
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
  /** Appelé avant chaque tentative de miroir — permet à l'appelant d'afficher
   *  une progression (« interrogation… » puis « nouvelle tentative… »). */
  onAttempt?: (mirrorIndex: number, totalMirrors: number) => void
  /**
   * Appelé pendant le téléchargement avec le nombre d'octets déjà reçus,
   * cumulé depuis le début de la réponse.
   *
   * Volontairement pas de pourcentage : la réponse arrive compressée et sans
   * `Content-Length` exploitable — l'en-tête, quand il existe, décrit les
   * octets compressés alors que le lecteur en rend des décompressés. Une
   * barre calculée là-dessus avancerait n'importe comment. Un compteur
   * d'octets ne promet rien qu'il ne tienne.
   */
  onProgress?: (octetsRecus: number) => void
}

/**
 * Lit le corps de la réponse en signalant l'avancement.
 *
 * Sans `onProgress` — ou sans flux, ce qui arrive sur d'anciens navigateurs
 * et dans les doublures de test — on retombe sur `response.json()`.
 */
async function lireCorps(
  response: Response,
  onProgress?: (octetsRecus: number) => void,
): Promise<unknown> {
  const flux = response.body
  if (!onProgress || !flux) return response.json()

  const lecteur = flux.getReader()
  const morceaux: Uint8Array[] = []
  let recus = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value)
    recus += value.byteLength
    onProgress(recus)
  }

  const entier = new Uint8Array(recus)
  let position = 0
  for (const morceau of morceaux) {
    entier.set(morceau, position)
    position += morceau.byteLength
  }
  return JSON.parse(new TextDecoder().decode(entier))
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

  for (const [mirrorIndex, mirror] of mirrors.entries()) {
    options.onAttempt?.(mirrorIndex, mirrors.length)
    try {
      // AbortSignal.timeout peut manquer sur d'anciens navigateurs : dans ce
      // cas on lance la requête sans limite plutôt que d'échouer d'office.
      let signal: AbortSignal | undefined
      try {
        signal = AbortSignal.timeout(timeoutMs)
      } catch {
        signal = undefined
      }
      const response = await fetchFn(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        ...(signal ? { signal } : {}),
      })
      if (!response.ok) continue
      const data: unknown = await lireCorps(response, options.onProgress)
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
