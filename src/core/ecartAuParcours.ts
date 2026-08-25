import { distanceMeters, distanceToSegmentMeters } from './geo.ts'
import { itineraryCoords } from './mapdata.ts'
import { displayName } from '../lib/format.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * Où l'on est par rapport au parcours suivi (issue #154).
 *
 * ## Pourquoi il n'y a pas d'hystérésis
 *
 * L'issue en demande une, « pour éviter le clignotement à la limite du
 * corridor ». Elle n'existe pas ici, et c'est délibéré : **il n'y a pas de
 * corridor.**
 *
 * Le clignotement est un symptôme du booléen — « dedans / dehors » — pas de
 * la mesure. Un booléen aurait demandé un seuil d'entrée et un seuil de
 * sortie, deux nombres que rien ne permet de fixer : ni le GPS d'un
 * téléphone, ni la largeur d'un sentier, ni la précision d'un tracé OSM ne
 * donnent la distance à partir de laquelle « on a quitté le parcours ».
 * Les inventer aurait changé ce qui est affirmé (CLAUDE.md §2), et affirmé
 * quelque chose de faux la moitié du temps.
 *
 * La distance, elle, est toujours vraie. On l'affiche telle quelle, en
 * permanence : il n'y a rien à faire clignoter.
 *
 * ## Ce que l'issue interdit, et qui est tenu à la lettre
 *
 * > Jamais présenté comme un dispositif de sécurité. Sentiers est un carnet,
 * > pas un GPS de secours (…) une alerte mal formulée le contredirait — avec
 * > des conséquences réelles si quelqu'un s'y fiait en montagne.
 *
 * D'où une phrase qui **constate** : « Vous êtes à 400 m du GR 7. » Pas de
 * point d'exclamation, pas de « attention », pas de « hors itinéraire ».
 * `tests/unit/ecartAuParcours.test.ts` cherche ces formules à six distances
 * différentes, plutôt que de s'en remettre à la relecture du jour.
 */

/**
 * Distance, en mètres, de la position au point le plus proche du tracé.
 *
 * `null` quand l'itinéraire n'a pas de géométrie : on ne mesure pas un écart
 * à rien.
 */
export function ecartAuParcours(
  position: LonLat,
  itineraire: Itinerary,
): number | null {
  const coords = itineraryCoords(itineraire)
  const [premier, ...suite] = coords
  if (!premier) return null
  if (suite.length === 0) return distanceMeters(position, premier)
  let min = Infinity
  let precedent = premier
  for (const courant of suite) {
    min = Math.min(min, distanceToSegmentMeters(position, precedent, courant))
    precedent = courant
  }
  return min
}

/**
 * En deçà, on dit « sur » plutôt qu'une distance.
 *
 * Ce n'est pas un corridor déguisé : le nombre ne décide de rien, il choisit
 * entre deux façons de dire la même chose. « Vous êtes à 4 m du GR 7 »
 * suggère un écart là où il n'y a que l'imprécision d'un GPS de téléphone,
 * qui vaut couramment plus que ça. C'est un seuil de **présentation**, que
 * le §2 autorise à trancher au jugement — à condition de l'écrire, ce qui
 * est fait ici.
 *
 * Piste écartée : afficher toujours la distance, y compris « 0 m ». Elle est
 * plus pure et moins juste — elle prétendrait une précision que l'appareil
 * n'a pas.
 */
const SUR_LE_TRACE_METERS = 15

/** La phrase affichée. Elle constate, elle n'alarme jamais. */
export function phraseDEcart(metres: number, itineraire: Itinerary): string {
  const nom = displayName(itineraire)
  if (metres <= SUR_LE_TRACE_METERS) return `Vous êtes sur le ${nom}.`
  if (metres < 1_000) {
    const arrondi = Math.round(metres / 10) * 10
    return `Vous êtes à ${String(arrondi)} m du ${nom}.`
  }
  const km = (metres / 1_000).toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })
  return `Vous êtes à ${km} km du ${nom}.`
}
