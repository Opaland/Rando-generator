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
export type ZoneGroup = 'proche' | 'aura' | 'vosges'

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

/**
 * Le massif vosgien (#286), demandé par Cédric le 24/08.
 *
 * Il déborde cinq départements sur trois régions : le découper autrement
 * qu'administrativement supposerait une limite de massif qu'OSM ne porte pas
 * sous une forme stable. On charge donc département par département, comme
 * pour Auvergne-Rhône-Alpes, et pour la même raison : une requête couvrant
 * tout le massif dépasserait le délai d'Overpass.
 *
 * Ce n'est **pas** « le Club Vosgien » : c'est la géographie où il balise.
 * Le balisage lui-même se lit sur chaque itinéraire, par `osmc:symbol`, et
 * ne dépend d'aucune zone.
 */
const VOSGES_DEPARTEMENTS: { id: string; label: string; name: string }[] = [
  { id: 'vosges', label: 'Vosges', name: 'Vosges' },
  { id: 'haut-rhin', label: 'Haut-Rhin', name: 'Haut-Rhin' },
  { id: 'bas-rhin', label: 'Bas-Rhin', name: 'Bas-Rhin' },
  { id: 'moselle', label: 'Moselle', name: 'Moselle' },
  { id: 'haute-saone', label: 'Haute-Saône', name: 'Haute-Saône' },
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
    // L'identifiant ne bouge pas : il est écrit en base comme `lastZoneKey`
    // et sert de clé au cache de zone. Le renommer perdrait silencieusement
    // la zone restaurée au démarrage de qui l'avait choisie.
    id: 'trois',
    // « Les trois » laissait deviner de quoi il s'agit (AUDIT_UX.md, constat
    // U7). Ce n'était pas une troncature : il y avait la place de l'écrire en
    // entier à toutes les largeurs.
    label: 'Rhône, Loire et Pilat',
    areaSelectors: [...RHONE_SELECTORS, ...LOIRE_SELECTORS, ...PILAT_SELECTORS],
    group: 'proche',
  },
  ...AURA_DEPARTEMENTS.map((dept) => ({
    id: dept.id,
    label: dept.label,
    areaSelectors: [departementSelector(dept.name)],
    group: 'aura' as const,
  })),
  ...VOSGES_DEPARTEMENTS.map((dept) => ({
    id: dept.id,
    label: dept.label,
    areaSelectors: [departementSelector(dept.name)],
    group: 'vosges' as const,
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

/**
 * La fin commune aux trois requêtes : les relations avec leur géométrie,
 * puis les tags de leurs chemins membres (issue #179).
 *
 * Écrite une fois et partagée, plutôt que recopiée trois fois — une garde
 * transverse se nomme, elle ne se recopie pas (CLAUDE.md §4). Les trois
 * requêtes avaient déjà divergé sur d'autres points par le passé.
 *
 * `out tags` et non `out meta geom` pour les chemins : leur géométrie est
 * déjà rendue par la relation, la redemander doublerait la réponse. Mesuré
 * sur la donnée réelle : les tags seuls coûtent +24 %, soit 129 octets par
 * chemin, là où la géométrie pèse l'essentiel.
 */
const SORTIE_AVEC_TAGS = `.itineraires out meta geom;
way(r.itineraires);
out tags;`

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
relation${ROUTE_FILTER}(area.zone)->.itineraires;
${SORTIE_AVEC_TAGS}`
}

/**
 * Couche interne : échappe les métacaractères pour que la ref soit cherchée
 * à la lettre, et non interprétée comme une expression régulière.
 */
function echapperRegex(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Couche externe : échappe ce qui a un sens dans une chaîne Overpass QL,
 * c'est-à-dire le guillemet qui la délimite et l'antislash qui échappe.
 * S'applique en dernier, sur le résultat de la couche interne — dont les
 * antislashs doivent eux aussi traverser QL intacts.
 */
function echapperQL(texte: string): string {
  return texte.replace(/["\\]/g, '\\$&')
}

/**
 * Requête Overpass : relations route=hiking par ref (ex. « GR 20 »), en France,
 * insensible à la casse et tolérante sur les espaces. La ref traverse deux
 * échappements successifs : celui de la regex, puis celui de la chaîne
 * Overpass QL qui la contient.
 */
export function buildRefQuery(ref: string): string {
  // Deux couches se superposent ici, et les confondre était le défaut de
  // l'issue #164. La ref devient une expression régulière (couche interne),
  // et cette expression s'écrit entre guillemets en Overpass QL (couche
  // externe). Le guillemet double n'est pas un métacaractère de regex : il
  // n'était pas échappé, et fermait la chaîne QL au milieu du filtre.
  const litteral = echapperRegex(ref.trim())
    // Injecté après l'échappement, parce que c'est de la syntaxe voulue :
    // l'espace de « GR 20 » devient optionnel, pour trouver « GR20 ».
    .replace(/\s+/g, ' ?')
  const escaped = echapperQL(litteral)
  return `[out:json][timeout:180];
area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;
relation${ROUTE_FILTER}["ref"~"^${escaped}$",i](area.fr)->.itineraires;
${SORTIE_AVEC_TAGS}`
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
relation${ROUTE_FILTER}(around:${String(Math.round(radiusMeters))},${lat.toFixed(6)},${lon.toFixed(6)})->.itineraires;
${SORTIE_AVEC_TAGS}`
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
  /**
   * Le motif rendu par le serveur quand la requête n'a pas abouti — ou pas
   * entièrement. Présent avec des données, il annonce un résultat partiel.
   */
  remark?: string
}

function isOverpassResponse(data: unknown): data is OverpassResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as { elements?: unknown }).elements)
  )
}

/**
 * Overpass ne signale pas ses échecs par un code HTTP.
 *
 * Une requête qui dépasse son délai ou sa mémoire répond **200**, avec un
 * corps JSON bien formé dont `elements` est un tableau vide et dont `remark`
 * porte le motif — « runtime error: Query timed out… », « …run out of
 * memory… ». Rien dans la forme ne distingue cette réponse d'une zone
 * réellement sans sentier.
 *
 * Le code ne lisait pas `remark`, et la conséquence était pire qu'une erreur :
 * l'application annonçait « Aucun itinéraire balisé trouvé dans cette zone sur
 * OpenStreetMap » pour un département qui en compte des milliers. Un miroir
 * en échec coupait aussi la bascule vers le second, puisqu'il passait pour
 * un succès.
 *
 * La règle ne devine rien du texte du motif — il est en anglais, sa forme
 * n'est pas contractuelle, et chercher « error » dedans serait inventer un
 * seuil (CLAUDE.md §2). Elle s'appuie sur ce que le serveur a rendu :
 *
 * - `remark` **et aucune donnée** : la requête n'a rien produit et le serveur
 *   dit pourquoi. C'est un échec de miroir, on essaie le suivant ;
 * - `remark` **avec des données** : un résultat partiel. On le garde — mieux
 *   vaut une zone incomplète que pas de zone — et le motif reste attaché à
 *   la réponse pour que l'appelant puisse le dire.
 */
function estUnEchecDeserveur(data: OverpassResponse): boolean {
  return data.remark !== undefined && data.elements.length === 0
}

/**
 * Convertit une réponse Overpass (relations avec `out geom`) en itinéraires.
 * Les membres non-way ou sans géométrie sont ignorés, les ways répétés dans
 * une relation sont dédupliqués, les relations sans géométrie sont écartées.
 */
/**
 * Les seuls tags de chemin qu'on retient (issue #179).
 *
 * Tout garder coûterait sans servir : mesuré sur 3 489 chemins réels, les
 * tags complets pèsent 450 ko dont l'essentiel en `maxspeed`, `lanes`,
 * `source` — qui ne disent rien d'un sentier. La revue du sprint 4 a montré
 * ce que coûte un champ ajouté au cache sans mesure préalable.
 */
const TAGS_RETENUS = [
  'surface',
  'smoothness',
  'tracktype',
  // `highway` est retenu pour ce qu'il permet de **déduire** quand
  // `surface` manque, ce qui est le cas des deux tiers de la longueur.
  // Mesuré sur 1 086 km réels : là où le revêtement est renseigné, une voie
  // carrossable est dure dans 93 à 100 % des cas, un chemin ou un sentier
  // ne l'est que dans 7 à 24 %. Vingt octets par chemin qui font tomber
  // l'inconnu de 67 % à 1,2 %.
  'highway',
] as const

function tagsUtiles(
  bruts: Record<string, string> | undefined,
): TrailWay['tags'] | undefined {
  if (!bruts) return undefined
  const retenus: Record<string, string> = {}
  for (const clef of TAGS_RETENUS) {
    const valeur = bruts[clef]
    if (valeur !== undefined) retenus[clef] = valeur
  }
  // `undefined` et non `{}` : un objet vide se sérialiserait dans le cache
  // pour ne rien dire, sur chaque chemin de chaque zone.
  return Object.keys(retenus).length > 0 ? retenus : undefined
}

export function parseOverpassResponse(
  data: OverpassResponse,
  fetchedAt: string,
): Itinerary[] {
  const itineraries: Itinerary[] = []
  // Les chemins arrivent après les relations dans la réponse, et sont
  // partagés entre itinéraires : on les indexe une fois.
  const tagsParWay = new Map<number, TrailWay['tags']>()
  for (const element of data.elements) {
    if (element.type !== 'way') continue
    const utiles = tagsUtiles(element.tags)
    if (utiles) tagsParWay.set(element.id, utiles)
  }
  for (const element of data.elements) {
    if (element.type !== 'relation') continue
    const seenWayIds = new Set<number>()
    const ways: TrailWay[] = []
    for (const member of element.members ?? []) {
      if (member.type !== 'way' || !member.geometry) continue
      if (seenWayIds.has(member.ref)) continue
      seenWayIds.add(member.ref)
      const coords: LonLat[] = member.geometry.map((g) => [g.lon, g.lat])
      const tags = tagsParWay.get(member.ref)
      ways.push(tags ? { osmWayId: member.ref, coords, tags } : { osmWayId: member.ref, coords })
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
      // Ce qui est peint sur l'arbre (#286). Deux champs seulement, et
      // seulement quand ils existent : le cache de zone ne grossit pas de
      // deux `null` par relation.
      ...(tags['osmc:symbol'] ? { osmcSymbol: tags['osmc:symbol'] } : {}),
      ...(tags.operator ? { operator: tags.operator } : {}),
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
  /** Le motif du dernier miroir ayant répondu qu'il n'y arrivait pas. */
  let dernierMotif: string | undefined

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
      if (!isOverpassResponse(data)) continue
      if (estUnEchecDeserveur(data)) {
        dernierMotif = data.remark
        continue
      }
      return data
    } catch {
      // Miroir injoignable ou réponse illisible : on tente le suivant.
    }
  }

  // Un serveur qui a répondu, mais en disant qu'il n'y arrivait pas, n'est pas
  // un serveur injoignable : le conseil « réessayez dans quelques minutes »
  // serait faux — une zone trop vaste le restera à la tentative suivante.
  if (dernierMotif !== undefined) {
    throw new OverpassError(
      'Cette zone est trop vaste pour les serveurs OpenStreetMap : la requête ' +
        'a été interrompue avant d’aboutir. Essayez un secteur plus petit — ' +
        'une recherche autour d’une ville, ou un itinéraire par son nom.',
    )
  }

  throw new OverpassError(
    'Impossible de joindre les serveurs de données OpenStreetMap (Overpass). ' +
      'Ils sont peut-être surchargés : réessayez dans quelques minutes.',
  )
}

/**
 * Le libellé à afficher pour une zone en cache.
 *
 * Une copie en cache garde le libellé du jour où elle a été écrite, et le
 * cache tient trente jours : renommer une zone n'aurait rien changé pour qui
 * l'avait déjà chargée (AUDIT_UX.md, constat U7). On préfère donc celui que
 * `ZONES` porte aujourd'hui, quand la clé en désigne une.
 *
 * Ce qui n'est pas une zone — une recherche par ref, une recherche autour
 * d'une ville — garde le sien : lui seul le connaît.
 */
export function libelleDeZone(zoneKey: string, stocke: string): string {
  return ZONES.find((zone) => zone.id === zoneKey)?.label ?? stocke
}
