import { IGN_TILES } from '../components/map/style.ts'
import {
  tuilesDuCorridor,
  urlDeTuile,
  type OptionsCorridor,
  type Tuile,
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
  /**
   * Ce que ça pèsera, à peu près (issue #397).
   *
   * Rendu ici et non recalculé par l'appelant : les tuiles sont déjà
   * énumérées, et retrouver leur zoom depuis les adresses serait lire deux
   * fois la même chose (§4ter).
   */
  octetsEstimes: number
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
  if (coords.length === 0)
    return { tuiles: [], altimetrie: null, octetsEstimes: 0 }
  const tuiles = tuilesDuCorridor(coords, options)
  return {
    tuiles: tuiles.map((tuile) => urlDeTuile(tuile, IGN_TILES)),
    altimetrie: buildElevationLineUrl(coords),
    octetsEstimes: poidsEstimeDesTuiles(tuiles),
  }
}

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
 * Ce qu'il faudrait pour trancher mieux était le poids réel d'une tuile IGN
 * sur un secteur de montagne. Il est mesuré depuis le 29/08 —
 * `docs/MESURE_TUILES.md`, `npm run poids-tuiles` — et il dit quelque chose
 * d'inattendu pour ce choix-ci : le poids **culmine au zoom 13** et
 * redescend ensuite. Une tuile z16 de Chartreuse pèse 3,6 fois moins qu'une
 * z13, donc « chaque zoom supplémentaire quadruple le nombre de tuiles » ne
 * se traduit pas en quadruplement du poids.
 *
 * Ce que la mesure ne dit toujours pas, c'est où couper : elle donne un
 * coût, pas une utilité. Le choix de 12–16 reste posé au jugement.
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
 * Ce que pèse une tuile IGN, par zoom, en octets — mesuré le 29/08.
 *
 * Ces cinq nombres viennent de `docs/MESURE_TUILES.md`, produit par
 * `npm run poids-tuiles` : douze tuiles pesées par zoom, sur les tuiles
 * réelles d'un corridor et non sur des voisines choisies à la main.
 *
 * ## Pourquoi ce sont les valeurs de ville et non celles de montagne
 *
 * La mesure donne deux tableaux, et l'écart entre eux **change de signe avec
 * le zoom** : la montagne est plus lourde aux zooms d'ensemble (+21 % à 13)
 * et beaucoup plus légère là où l'on lit un sentier (−45 % à 16). Aucun des
 * deux terrains ne majore l'autre.
 *
 * On retient donc, zoom par zoom, **le plus lourd des deux**. Ce n'est le
 * profil d'aucun terrain réel — c'est délibéré : une annonce trop basse est
 * une promesse rompue au moment où quelqu'un regarde son forfait, une
 * annonce trop haute est une bonne surprise.
 *
 * Sur le corridor mesuré, cette règle donne 4,9 Mo pour 4,6 Mo réels : elle
 * majore de 6 % là où elle a été calibrée, et de 27 % en Chartreuse.
 */
export const POIDS_MOYEN_PAR_ZOOM: Record<number, number> = {
  12: 89_838,
  13: 105_422,
  14: 96_539,
  15: 73_093,
  16: 53_707,
}

/** Le plus lourd des poids mesurés, pour un zoom dont on ne sait rien. */
const POIDS_INCONNU = Math.max(...Object.values(POIDS_MOYEN_PAR_ZOOM))

/**
 * Ce que pèsera, à peu près, le téléchargement de ces tuiles.
 *
 * Une somme de moyennes : ce n'est pas le poids, c'est son ordre de
 * grandeur. Les tuiles d'un même zoom vont du simple au double
 * (`docs/MESURE_TUILES.md`), et rien ici ne prétend le contraire — c'est
 * pourquoi le bouton dit « environ » et pourquoi le compte de tuiles, lui
 * exact, reste affiché à côté.
 *
 * Un zoom non mesuré compte au plus lourd connu plutôt qu'à zéro : une
 * tuile oubliée d'une estimation est une estimation silencieusement trop
 * basse, et c'est le seul défaut que ce nombre ne doit pas avoir.
 */
export function poidsEstimeDesTuiles(tuiles: Tuile[]): number {
  return tuiles.reduce(
    (total, tuile) => total + (POIDS_MOYEN_PAR_ZOOM[tuile.z] ?? POIDS_INCONNU),
    0,
  )
}

/**
 * Ce que dit le bouton, aux trois moments de sa vie.
 *
 * Avant : **le compte de tuiles, exact, et le poids, approché** — « 104
 * tuiles, environ 7 Mo ». L'issue #153 demandait « le budget affiché avant
 * de lancer » ; elle ne l'a pas eu tant que le poids d'une tuile n'était pas
 * mesuré, parce qu'annoncer « environ 40 Mo » aurait caché un nombre inventé
 * derrière un mot rassurant (CLAUDE.md §2).
 *
 * La mesure existe depuis le 29/08 (`docs/MESURE_TUILES.md`), et le §2 range
 * la suite du côté de ce qui **se tranche au jugement** : ce nombre ne
 * change rien à ce qui est téléchargé, seulement à ce qui en est dit. Il
 * reste à écrire ce qui a été écarté, et pourquoi.
 *
 * ## Les deux autres pistes, et pourquoi pas elles
 *
 * **Ne rien changer, garder le compte seul** (#397, piste 1). Défendable : le
 * compte est exact, l'estimation ne l'est pas. Écartée parce qu'un compte de
 * tuiles ne répond à aucune des deux questions qu'on se pose avant
 * d'appuyer — combien de forfait, combien de place. Quatre-vingts tuiles ne
 * veulent rien dire ; quatre mégaoctets, si.
 *
 * **Afficher une fourchette**, « entre 3 et 6 Mo » (piste 2, variante).
 * Écartée parce qu'elle est plus honnête et moins utile : personne ne décide
 * mieux avec deux nombres qu'avec un seul assorti d'« environ », et la
 * fourchette double la longueur d'un libellé déjà long sur un écran de
 * 390 px.
 *
 * ## Ce qui rend le chiffre affichable
 *
 * Il **majore**. `POIDS_MOYEN_PAR_ZOOM` retient, zoom par zoom, le plus
 * lourd des deux terrains mesurés : l'annonce est haute de 6 % là où elle a
 * été calibrée et de 27 % en Chartreuse. Une annonce trop basse est une
 * promesse rompue au moment où quelqu'un regarde son forfait ; une annonce
 * trop haute est une bonne surprise, et c'est le seul sens dans lequel une
 * estimation a le droit de se tromper.
 *
 * Et il ne s'affiche pas seul : le compte exact reste à côté, de sorte que
 * ce qui est su et ce qui est estimé ne se confondent pas.
 *
 * Pendant et après : des octets réellement reçus, comptés par le service
 * worker. Là, le chiffre est mesuré, et il peut être affiché sans réserve.
 */
export function libelleTelechargement(
  progres: ProgresTelechargement | null,
  tuiles: number,
  octetsEstimes: number,
): string {
  if (progres === null) {
    if (tuiles <= 0) return 'Emporter cette randonnée'
    const unite = tuiles === 1 ? 'tuile' : 'tuiles'
    const compte = `${String(tuiles)} ${unite}`
    // Une estimation absente n'est pas une estimation nulle : sans elle, le
    // bouton se tait sur le poids plutôt que de promettre « environ 0 o ».
    const poids =
      octetsEstimes > 0 ? `, environ ${formatOctets(octetsEstimes)}` : ''
    return `Emporter cette randonnée (${compte}${poids})`
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
