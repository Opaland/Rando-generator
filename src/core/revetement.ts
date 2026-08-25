import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * Le revêtement d'un itinéraire, porté le long du profil (issue #179).
 *
 * La forme de ce module vient d'une mesure, pas d'une intuition. Sur
 * 1 086 km d'itinéraires réels du Pilat, interrogés chez Overpass :
 *
 *     surface renseigné     33 % de la longueur
 *     smoothness renseigné   6 %
 *     non renseigné         67 %
 *
 * Deux tiers d'inconnu, et sur *chaque* itinéraire sans exception — de 63 %
 * sur le plus documenté à 99 % sur le moins.
 *
 * Un filtre « praticable en poussette » trancherait donc sur un tiers de
 * l'information en laissant croire qu'il tranche sur tout : exactement le
 * mensonge que l'issue cherche à éviter, remonté d'un cran. D'où le parti
 * pris : montrer **où** c'est connu le long du parcours, et laisser la
 * personne conclure.
 *
 * `smoothness` à 6 % ne permet même pas cela. Il peut enrichir une fiche là
 * où il existe ; il ne peut rien décider.
 */

export type FamilleRevetement =
  | 'dur'
  | 'stabilise'
  | 'naturel'
  | 'autre'
  | 'inconnu'

/**
 * Les valeurs OSM rangées par famille. `surface` accepte n'importe quelle
 * chaîne : cette table couvre ce qu'on rencontre, et tout le reste tombe
 * dans « autre » — deviner la famille d'une valeur rare reviendrait à
 * décider à la place de quelqu'un qui décide de s'engager.
 */
const FAMILLES: Record<string, FamilleRevetement> = {
  asphalt: 'dur',
  concrete: 'dur',
  'concrete:plates': 'dur',
  'concrete:lanes': 'dur',
  paved: 'dur',
  paving_stones: 'dur',
  sett: 'dur',
  cobblestone: 'dur',
  chipseal: 'dur',
  metal: 'dur',
  wood: 'dur',

  compacted: 'stabilise',
  fine_gravel: 'stabilise',
  gravel: 'stabilise',
  pebblestone: 'stabilise',
  unpaved: 'stabilise',

  ground: 'naturel',
  dirt: 'naturel',
  earth: 'naturel',
  grass: 'naturel',
  mud: 'naturel',
  sand: 'naturel',
  rock: 'naturel',
  stone: 'naturel',
  woodchips: 'naturel',
}

/**
 * `null` rend « inconnu », jamais « autre ». La distinction porte tout :
 * « autre » dit qu'OpenStreetMap sait et qu'on ne classe pas la valeur ;
 * « inconnu » dit qu'OpenStreetMap ne sait pas. C'est le cas des deux tiers
 * de la longueur mesurée, et le confondre avec « autre » laisserait croire
 * à une donnée qui n'existe pas.
 */
export function familleRevetement(
  valeur: string | null | undefined,
): FamilleRevetement {
  if (valeur === null || valeur === undefined) return 'inconnu'
  return FAMILLES[valeur] ?? 'autre'
}

const LIBELLES: Record<string, string> = {
  asphalt: 'bitume',
  concrete: 'béton',
  'concrete:plates': 'plaques de béton',
  'concrete:lanes': 'bandes de béton',
  paved: 'revêtu',
  paving_stones: 'pavés',
  sett: 'pavés taillés',
  cobblestone: 'pavés ronds',
  chipseal: 'enduit gravillonné',
  metal: 'métal',
  wood: 'bois',
  compacted: 'grave compactée',
  fine_gravel: 'gravier fin',
  gravel: 'gravier',
  pebblestone: 'galets',
  unpaved: 'non revêtu',
  ground: 'terre',
  dirt: 'terre battue',
  earth: 'terre',
  grass: 'herbe',
  mud: 'boue',
  sand: 'sable',
  rock: 'roche',
  stone: 'pierre',
  woodchips: 'copeaux de bois',
}

/**
 * Traduit sans réinterpréter. Une valeur inconnue est rendue telle quelle
 * plutôt qu'approximée : la personne peut chercher ce que « woodchips »
 * veut dire, là où un mot approchant la renseignerait mal.
 */
export function libelleRevetement(valeur: string | null | undefined): string {
  if (valeur === null || valeur === undefined) return 'non renseigné'
  return LIBELLES[valeur] ?? valeur
}

/**
 * D'où vient ce qu'on affiche. La distinction n'est pas décorative : elle
 * sépare ce qu'OpenStreetMap dit de ce que nous en déduisons, et interdit
 * de présenter une supposition comme un relevé.
 */
export type OrigineRevetement = 'renseigne' | 'deduit' | 'inconnu'

/**
 * Les types de voie dont on déduit un revêtement dur.
 *
 * Mesuré sur 3 489 chemins réels, en ne regardant que ceux dont le
 * revêtement *est* renseigné : secondary 100 % dur (180 cas), tertiary
 * 100 % (191), primary 100 % (69), residential 97 % (256), unclassified
 * 93 % (176).
 */
const VOIES_CARROSSABLES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
])

/**
 * Les types de voie dont on déduit un sol naturel.
 *
 * Mesuré : track n'est dur que dans 7 % des cas (246 relevés), path dans
 * 24 % (117). Se tromper ici fait éviter un chemin qui était praticable —
 * cela coûte une occasion, jamais un danger, et c'est ce qui rend la
 * déduction acceptable dans ce sens-là.
 */
const CHEMINS_NATURELS = new Set(['track', 'path', 'bridleway'])

/**
 * Les types qu'on refuse de trancher, parce que la mesure les montre
 * réellement partagés : cycleway est dur dans 56 % des cas, service dans
 * 71 %, steps dans 66 %, pedestrian sur trop peu de relevés. Déduire là
 * reviendrait à tirer à pile ou face en le présentant comme un
 * renseignement.
 */

export interface Revetement {
  famille: FamilleRevetement
  origine: OrigineRevetement
  /** Valeur OSM brute ; `null` dès qu'on déduit — on n'a pas *lu* « bitume ». */
  surface: string | null
}

/**
 * Ce qu'on peut dire du revêtement d'un chemin, et avec quelle autorité.
 *
 * L'ordre compte : un `surface` renseigné l'emporte toujours sur ce que le
 * type de voie laisserait supposer. On ne déduit que dans le silence.
 */
export function revetementDuChemin(
  tags: { surface?: string; highway?: string } | undefined,
): Revetement {
  const surface = tags?.surface
  if (surface !== undefined) {
    return {
      famille: familleRevetement(surface),
      origine: 'renseigne',
      surface,
    }
  }
  const highway = tags?.highway
  if (highway !== undefined && VOIES_CARROSSABLES.has(highway)) {
    return { famille: 'dur', origine: 'deduit', surface: null }
  }
  if (highway !== undefined && CHEMINS_NATURELS.has(highway)) {
    return { famille: 'naturel', origine: 'deduit', surface: null }
  }
  return { famille: 'inconnu', origine: 'inconnu', surface: null }
}

/** Un tronçon de parcours de revêtement homogène, en distance cumulée. */
export interface Bande {
  /** Distance depuis le départ, en mètres. */
  debut: number
  fin: number
  /** Valeur OSM brute ; `null` si déduite ou absente. */
  surface: string | null
  famille: FamilleRevetement
  origine: OrigineRevetement
}

/**
 * Découpe l'itinéraire en bandes de revêtement homogène.
 *
 * Les distances sont celles de la polyligne concaténée des ways, dans le
 * même ordre que `itineraryCoords` — c'est ce qui permet au profil
 * altimétrique, dont l'axe est cette même distance, de les superposer sans
 * réattribution point par point.
 */
export function bandesDeRevetement(itinerary: Itinerary): Bande[] {
  const bandes: Bande[] = []
  let curseur = 0
  for (const way of itinerary.ways) {
    const longueur = polylineLengthMeters(way.coords)
    // Un way d'un seul point n'a pas de longueur : l'inclure créerait une
    // bande vide, et une bande vide se dessine comme un trait parasite.
    if (longueur <= 0) continue
    const { famille, origine, surface } = revetementDuChemin(way.tags)
    const derniere = bandes.at(-1)
    // Fusion des voisins équivalents : sans elle, un long itinéraire rendrait
    // des centaines de bandes identiques, illisibles et coûteuses à peindre.
    //
    // L'origine entre dans la comparaison : deux tronçons durs, l'un lu et
    // l'autre supposé, ne se fondent pas en un seul — la nuance doit rester
    // visible à l'écran.
    if (
      derniere !== undefined &&
      derniere.origine === origine &&
      derniere.famille === famille &&
      derniere.surface === surface
    ) {
      derniere.fin = curseur + longueur
    } else {
      bandes.push({
        debut: curseur,
        fin: curseur + longueur,
        surface,
        famille,
        origine,
      })
    }
    curseur += longueur
  }
  return bandes
}

/** Un tronçon de tracé, avec sa géométrie et ce qu'on sait de son sol. */
export interface SegmentRevetement {
  coords: LonLat[]
  famille: FamilleRevetement
  origine: OrigineRevetement
  /** Valeur OSM brute ; `null` si déduite ou absente. */
  surface: string | null
}

/**
 * Le revêtement **en géométrie**, pour la carte (demande du 24/08).
 *
 * Ce n'est pas `bandesDeRevetement` sous un autre nom. Les bandes travaillent
 * en distance cumulée et **fusionnent les voisins équivalents**, sans quoi un
 * long itinéraire rendrait des centaines de rectangles identiques sous la
 * courbe du profil.
 *
 * Sur la carte, fusionner deux tronçons voisins reviendrait à recoller leurs
 * géométries — ce qui suppose qu'elles se touchent, et un itinéraire OSM
 * troué ne le garantit pas (c'est même exactement ce que
 * `assessItinerary` signale). Chaque tronçon reste donc un segment, et la
 * carte peint autant de lignes qu'il y a de ways.
 *
 * L'inconnu est rendu comme le reste : c'est à l'affichage de décider de ne
 * rien peindre, pas au calcul. Mélanger les deux ôterait à la carte le moyen
 * de dire « ici, on ne sait pas » le jour où elle voudrait le dire.
 */
export function segmentsDeRevetement(
  itinerary: Itinerary,
): SegmentRevetement[] {
  const segments: SegmentRevetement[] = []
  for (const way of itinerary.ways) {
    // Un tronçon d'un seul point n'a pas de longueur : le dessiner produirait
    // un artefact ponctuel qui ressemble à un repère.
    if (way.coords.length < 2) continue
    if (polylineLengthMeters(way.coords) <= 0) continue
    const { famille, origine, surface } = revetementDuChemin(way.tags)
    segments.push({ coords: way.coords, famille, origine, surface })
  }
  return segments
}

export interface Couverture {
  /** Longueur dont le revêtement est **lu** dans OpenStreetMap. */
  connuMetres: number
  /** Longueur dont le revêtement est **déduit** du type de voie. */
  deduitMetres: number
  /** Longueur sur laquelle on ne sait rien dire. */
  inconnuMetres: number
  totalMetres: number
  /** Part renseignée, entre 0 et 1. Zéro quand il n'y a rien à mesurer. */
  fraction: number
}

/**
 * Quelle fraction de la longueur porte un revêtement renseigné.
 *
 * C'est ce chiffre qu'il faut afficher, et non un verdict : « revêtement
 * connu sur 21 % du parcours » se vérifie, là où « praticable » se contente
 * d'être rassurant.
 */
export function couvertureRevetement(bandes: Bande[]): Couverture {
  let connu = 0
  let deduit = 0
  let inconnu = 0
  let total = 0
  for (const bande of bandes) {
    const longueur = bande.fin - bande.debut
    total += longueur
    if (bande.origine === 'renseigne') connu += longueur
    else if (bande.origine === 'deduit') deduit += longueur
    else inconnu += longueur
  }
  return {
    connuMetres: connu,
    deduitMetres: deduit,
    inconnuMetres: inconnu,
    totalMetres: total,
    fraction: total > 0 ? connu / total : 0,
  }
}

/**
 * La part de chaque famille de revêtement dans la longueur d'un itinéraire
 * (issue #179).
 *
 * Nadia sort avec sa fille en fauteuil tout-terrain. Elle ne cherche pas un
 * pictogramme « accessible » — elle a appris à s'en méfier, parce qu'il l'a
 * déjà envoyée sur un sentier qu'elle n'a pas pu faire. Elle cherche ce
 * qu'il y a sous les roues, et elle sait parfaitement lire une donnée
 * absente. Ce qu'une donnée absente lui coûte, c'est un doute ; ce qu'une
 * promesse fausse lui coûte, c'est une journée et la déception de sa fille.
 *
 * Deux règles, et la seconde est la vraie :
 *
 * 1. la part se compte **en longueur**, pas en nombre de tronçons — un
 *    kilomètre de sentier et dix mètres de bitume ne pèsent pas pareil ;
 * 2. **`inconnu` est une part comme les autres, et elle est rendue.** La
 *    noyer dans « naturel » ou la retirer du dénominateur ferait passer un
 *    itinéraire dont on ne sait rien pour un itinéraire dont on sait qu'il
 *    est roulant. C'est précisément l'erreur qu'elle redoute.
 *
 * Les parts somment donc toujours à 1 — sauf sur un itinéraire sans
 * longueur, où elles valent toutes 0 plutôt que `NaN`.
 */
export type PartsRevetement = Record<FamilleRevetement, number>

export function partsDeRevetement(itinerary: Itinerary): PartsRevetement {
  const parts: PartsRevetement = {
    dur: 0,
    stabilise: 0,
    naturel: 0,
    autre: 0,
    inconnu: 0,
  }
  let total = 0
  for (const way of itinerary.ways) {
    const longueur = polylineLengthMeters(way.coords)
    if (longueur <= 0) continue
    total += longueur
    parts[revetementDuChemin(way.tags).famille] += longueur
  }
  // Un itinéraire sans longueur rendrait `0/0`. Zéro partout dit la même
  // chose sans propager un NaN dans un pourcentage affiché.
  if (total === 0) return parts
  for (const famille of Object.keys(parts) as FamilleRevetement[]) {
    parts[famille] /= total
  }
  return parts
}
