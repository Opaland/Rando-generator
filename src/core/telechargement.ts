import { IGN_TILES, OSM_TILES } from '../components/map/style.ts'
import {
  tuilesDuCorridor,
  urlDeTuile,
  type OptionsCorridor,
} from './corridor.ts'
import { buildElevationLineUrl } from './elevation.ts'
import type { LonLat } from './types.ts'

/**
 * Emporter une randonnée (issue #153).
 *
 * Le service worker dit noir sur blanc qu'il ne cache **ni** le profil
 * altimétrique **ni** les points d'intérêt, et il a raison de le dire :
 * « un relief ou des POI périmés ne valent pas mieux qu'un message clair ».
 *
 * Cette issue ne renverse pas cette règle, elle la complète. Le cache
 * devient **volontaire** : rien n'est gardé parce qu'on l'a regardé ; les
 * choses sont gardées parce qu'on a appuyé sur « Télécharger cette
 * randonnée ». Un profil qu'on a emporté exprès n'est pas un profil périmé
 * qu'on n'a pas demandé — et c'est la différence entre une promesse tenue
 * et une promesse faite à la place de quelqu'un.
 */

/** La page demande au service worker de mettre ces adresses de côté. */
export const MESSAGE_PRECHARGER = 'sentiers:precharger'

/** Le service worker rend compte de ce qu'il a fait, adresse par adresse. */
export const MESSAGE_PROGRES = 'sentiers:telechargement'

/** Ce que le service worker renvoie à chaque pas. */
export interface ProgresTelechargement {
  faites: number
  total: number
  /** Octets réellement reçus, cumulés. Mesuré, jamais estimé. */
  octets: number
  /** Adresses que le réseau a refusées ; le reste est en cache. */
  echecs: number
  fini: boolean
}

/** Une tuile de fond de carte, cachée par le service worker depuis toujours. */
export function estTuileCarte(url: URL): boolean {
  return (
    (url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/wmts')) ||
    url.hostname === 'tile.openstreetmap.org'
  )
}

/**
 * Le service altimétrique de la Géoplateforme.
 *
 * Même hôte que les tuiles IGN, mais pas sous `/wmts` — c'est exactement
 * pour cela qu'il n'était jamais caché, et l'issue #153 le relève comme
 * vérifié. Le distinguer d'une tuile n'est pas une coquetterie : les tuiles
 * vivent dans un cache borné à six cents entrées, prévu pour des images de
 * quelques kilo-octets, et un profil de cent points n'a rien à y faire.
 */
export function estAltimetrie(url: URL): boolean {
  return (
    url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/altimetrie')
  )
}

export interface RessourcesRandonnee {
  /** Adresses des tuiles du corridor, dédoublonnées et dans un ordre stable. */
  tuiles: string[]
  /** Adresse du profil altimétrique, ou `null` s'il n'y a pas de géométrie. */
  altimetrie: string | null
}

/**
 * Tout ce qu'il faut mettre de côté pour marcher cet itinéraire sans réseau.
 *
 * Le fond employé est celui de la Géoplateforme, celui que l'application
 * affiche par défaut. Le repli OpenStreetMap n'est pas préchargé : il sert
 * quand l'IGN ne répond pas, ce qui est un cas de réseau — et on ne prépare
 * pas une panne de réseau en doublant un téléchargement fait pour s'en
 * passer.
 */
export function ressourcesDeLaRandonnee(
  coords: LonLat[],
  options: OptionsCorridor,
): RessourcesRandonnee {
  if (coords.length === 0) return { tuiles: [], altimetrie: null }
  return {
    tuiles: tuilesDuCorridor(coords, options).map((tuile) =>
      urlDeTuile(tuile, IGN_TILES),
    ),
    altimetrie: buildElevationLineUrl(coords),
  }
}

/** Exporté pour les tests : le repli, qui n'est pas préchargé. */
export const FOND_DE_REPLI = OSM_TILES
