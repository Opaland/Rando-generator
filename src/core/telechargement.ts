import { IGN_TILES, OSM_TILES } from '../components/map/style.ts'
import {
  tuilesDuCorridor,
  urlDeTuile,
  type OptionsCorridor,
} from './corridor.ts'
import { formatOctets } from '../lib/format.ts'
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

/**
 * Les zooms où l'on lit un sentier, et pas au-delà.
 *
 * Ce nombre décide de **ce qui est téléchargé** : il tombe du côté de
 * CLAUDE.md §2 où l'on n'invente pas, et il est posé faute de mesure. Ce
 * qui est exigible, c'est de dire d'où il vient.
 *
 * En deçà de 12, la tuile ne montre plus le tracé, seulement la vallée ;
 * au-delà de 16, la Géoplateforme sert le cadastre, utile en ville et sans
 * objet sur un GR — et chaque zoom supplémentaire quadruple le nombre de
 * tuiles. Mesuré sur 2,3 km de GR : 104 tuiles pour ces cinq zooms.
 *
 * Ce qu'il faudrait pour trancher mieux : le poids réel d'une tuile IGN sur
 * un secteur de montagne, que personne n'a relevé.
 */
export const ZOOMS_TERRAIN = [12, 13, 14, 15, 16]

/**
 * Un demi-kilomètre de part et d'autre du tracé.
 *
 * De quoi couvrir un écart de sentier, une variante de balisage, et le
 * décalage entre le tracé OSM et ce qu'on a sous les pieds — sans emporter
 * la vallée voisine. Même réserve que ci-dessus : posé au jugement, non
 * mesuré.
 */
export const RAYON_CORRIDOR_METRES = 500

/**
 * Ce que dit le bouton, aux trois moments de sa vie.
 *
 * Avant : le nombre de tuiles. C'est ce qu'on sait exactement, et c'est
 * tout ce qu'on sait — l'issue #153 demandait « le budget affiché avant de
 * lancer », c'est-à-dire des mégaoctets, et elle ne les aura pas : personne
 * n'a mesuré ce que pèse une tuile de la Géoplateforme sur un secteur de
 * montagne. Annoncer « environ 40 Mo » reviendrait à cacher un nombre
 * inventé derrière un mot rassurant (CLAUDE.md §2). Le jour où la mesure
 * existera, elle se posera ici sans rien déplacer d'autre.
 *
 * Pendant et après : des octets réellement reçus, comptés par le service
 * worker. Là, le chiffre est mesuré, et il peut être affiché sans réserve.
 */
export function libelleTelechargement(
  progres: ProgresTelechargement | null,
  tuiles: number,
): string {
  if (progres === null) {
    if (tuiles <= 0) return 'Emporter cette randonnée'
    const unite = tuiles === 1 ? 'tuile' : 'tuiles'
    return `Emporter cette randonnée (${String(tuiles)} ${unite})`
  }
  const poids = formatOctets(progres.octets)
  if (!progres.fini) {
    return `${String(progres.faites)} / ${String(progres.total)} · ${poids}`
  }
  if (progres.echecs <= 0) return `Emportée · ${poids}`
  const accord = progres.echecs === 1 ? 'manquante' : 'manquantes'
  return `Emportée · ${poids} · ${String(progres.echecs)} ${accord}`
}

/**
 * La page demande au service worker de s'arrêter là où il en est.
 *
 * Sans ce message, le bouton serait un piège : le corridor d'un GR de
 * 200 km compte des milliers de tuiles, la boucle est séquentielle, et rien
 * ne permettrait de revenir en arrière. Fermer la fiche l'envoie.
 */
export const MESSAGE_ARRETER = 'sentiers:arreter-telechargement'
