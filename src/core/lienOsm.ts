import { vientDOpenStreetMap } from './provenance.ts'
import type { GeometryGap } from './dataQuality.ts'
import type { Itinerary } from './types.ts'

/**
 * Rendre à OpenStreetMap ce qu'on lui doit (issue #160).
 *
 * Sentiers dit la qualité de sa donnée au lieu de la maquiller : les
 * relations trouées sont signalées, le nombre de morceaux et les kilomètres
 * d'interruption donnés. Et là, ça s'arrêtait. Marc, baliseur bénévole, voit
 * qu'il manque douze kilomètres à une relation, connaît le terrain mieux
 * qu'OpenStreetMap, et n'avait aucun moyen d'aller le corriger depuis ici.
 *
 * C'est le seul endroit du produit où la valeur remonte vers la communauté
 * dont il dépend entièrement : les tracés viennent d'OSM, et les trous que
 * Marc comble profitent à tous — ici comme là-bas.
 *
 * **Vers la page de la relation, pas vers l'éditeur.** Ouvrir directement iD
 * mettrait quelqu'un en position de modifier une donnée partagée avant
 * d'avoir vu ce qu'elle contient. La page porte le bouton « Modifier » ; le
 * geste reste à celui qui le fait.
 */

/*
  La liste des réseaux OSM vivait ici, en dur : `['GR', 'GRP', 'PR']`.

  Elle répondait à la même question que la section « Sous les pieds » de la
  fiche — « cet itinéraire vient-il d'OpenStreetMap ? » — et les deux ne
  s'accordaient pas. Celle-ci oubliait `INCONNU`, qui est pourtant une
  relation OSM parfaitement réelle : seulement une dont le tag `network` ne
  nous a rien dit. Marc, baliseur, ne pouvait donc pas aller corriger le trou
  d'une relation mal étiquetée — c'est-à-dire exactement celles qui en ont le
  plus besoin.

  Trouvé en écrivant #317, sans le chercher : deux listes qui disent la même
  règle ont le même trou (§4ter), et le remède est une fonction nommée appelée
  des deux côtés — `vientDOpenStreetMap`.
*/

/**
 * Zoom du cadrage sur l'interruption.
 *
 * 15 montre environ un kilomètre de large : de quoi voir le trou **et** ce
 * qui l'entoure, ce dont on a besoin pour le combler. Plus près, on ne voit
 * plus à quoi raccorder ; plus loin, on ne voit plus la coupure.
 *
 * C'est un réglage d'affichage sur un site tiers : il ne change rien à ce
 * qui est calculé (CLAUDE.md §2).
 */
export const ZOOM_TROU = 15

/** Nombre de décimales du cadrage — ~1 m, la précision utile ici. */
const DECIMALES = 5

function nettoyer(valeur: number): string {
  // `parseFloat` retire les zéros de fin : « 45.4 » plutôt que « 45.40000 »,
  // ce qui donne une adresse lisible et copiable à la main.
  return String(Number.parseFloat(valeur.toFixed(DECIMALES)))
}

/**
 * L'adresse de la relation sur openstreetmap.org, cadrée sur la plus grande
 * interruption quand on sait la situer. `null` si l'itinéraire n'en est pas
 * une.
 *
 * Les trous arrivent triés du plus grand au plus petit (`assessItinerary`) :
 * on vise le premier, et son **milieu** — c'est le vide qu'on veut montrer,
 * pas son bord.
 */
export function lienOpenStreetMap(
  itinerary: Itinerary,
  gaps: GeometryGap[],
): string | null {
  if (!vientDOpenStreetMap(itinerary)) return null
  const base = `https://www.openstreetmap.org/relation/${String(
    itinerary.osmRelationId,
  )}`
  const plusGrand = gaps[0]
  if (!plusGrand) return base
  const lon = (plusGrand.from[0] + plusGrand.to[0]) / 2
  const lat = (plusGrand.from[1] + plusGrand.to[1]) / 2
  return `${base}#map=${String(ZOOM_TROU)}/${nettoyer(lat)}/${nettoyer(lon)}`
}
