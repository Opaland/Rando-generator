import { LOCAL_RELATION_ID_BASE } from './boucles.ts'
import type { Itinerary } from './types.ts'

/**
 * D'où vient un itinéraire — et donc ce qu'on a le droit d'écrire à son sujet
 * (issue #317).
 *
 * La fiche affichait, sur « Au cœur des Monts d'Or » :
 *
 * > Non renseigné : 100 % — *calculé sur la longueur, d'après ce
 * > qu'OpenStreetMap renseigne chemin par chemin.*
 *
 * Or cette boucle vient du jeu ouvert de la Métropole de Lyon.
 * `parseBouclesGeoJSON` construit ses ways depuis un `MultiLineString`, **sans
 * aucun tag, jamais** : il n'y en a pas dans la source, et on n'interroge pas
 * OpenStreetMap pour les obtenir. Les « 100 % non renseigné » ne sont donc pas
 * le silence d'OSM — c'est qu'on ne lui a rien demandé.
 *
 * La phrase était vraie là où elle a été écrite, pour une relation OSM, et
 * fausse pour les cinquante-cinq boucles locales. §4bis, dans la forme exacte
 * que CLAUDE.md décrit : « aucun n'était faux quand il a été écrit ».
 *
 * La faute n'est pas dans le verbe mais dans l'**attribution** : on cite une
 * source qui n'est pas la nôtre. `etatDeclare.test.ts` ne pouvait pas la voir,
 * puisqu'il traque les formules qui affirment un état.
 */

/**
 * Cet itinéraire vient-il d'OpenStreetMap ?
 *
 * **Deux critères, et c'est délibéré.** `network` est une étiquette que
 * l'import décide ; la plage d'identifiants est structurelle — `boucles.ts`
 * fabrique ses relations au-dessus de `LOCAL_RELATION_ID_BASE` précisément
 * pour ne jamais collisionner avec une vraie relation OSM. Le jour où les deux
 * ne s'accordent pas, la bonne réponse est « non » : se tromper dans ce sens
 * fait taire une phrase, se tromper dans l'autre fait attribuer à
 * OpenStreetMap une donnée qu'il n'a jamais vue.
 *
 * Ce n'est pas une liste jumelle au sens du §4ter : les deux conditions vivent
 * dans la même fonction, elles ne peuvent pas diverger sans qu'on les voie.
 */
export function vientDOpenStreetMap(itin: Itinerary): boolean {
  if (itin.network === 'LOCAL' || itin.network === 'PERSO') return false
  if (itin.osmRelationId >= LOCAL_RELATION_ID_BASE) return false
  return true
}
