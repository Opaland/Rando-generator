import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary } from './types.ts'

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

/** Un tronçon de parcours de revêtement homogène, en distance cumulée. */
export interface Bande {
  /** Distance depuis le départ, en mètres. */
  debut: number
  fin: number
  /** Valeur OSM brute ; `null` si le tronçon n'est pas renseigné. */
  surface: string | null
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
    const surface = way.tags?.surface ?? null
    const derniere = bandes.at(-1)
    // Fusion des voisins de même revêtement : sans elle, un long itinéraire
    // rendrait des centaines de bandes identiques, illisibles et coûteuses
    // à peindre. Les inconnus se fusionnent comme les autres.
    if (derniere && derniere.surface === surface) {
      derniere.fin = curseur + longueur
    } else {
      bandes.push({ debut: curseur, fin: curseur + longueur, surface })
    }
    curseur += longueur
  }
  return bandes
}

export interface Couverture {
  connuMetres: number
  totalMetres: number
  /** Entre 0 et 1. Zéro quand il n'y a rien à mesurer. */
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
  let total = 0
  for (const bande of bandes) {
    const longueur = bande.fin - bande.debut
    total += longueur
    if (bande.surface !== null) connu += longueur
  }
  return {
    connuMetres: connu,
    totalMetres: total,
    fraction: total > 0 ? connu / total : 0,
  }
}
