import type { CompletionResult, Itinerary } from './types.ts'

/**
 * La longueur d'un itinéraire telle qu'on l'affiche, et la part parcourue
 * (#564).
 *
 * Il en avait deux : la liste montrait `totalMeters`, la longueur exacte des
 * ways ; la carte et la fiche, le nombre d'échantillons fois 100 m — où chaque
 * way compte au moins un échantillon. Un way de 1 250 m faisait « 1,2 km »
 * dans la liste et « 1,3 km » sur la fiche ; cent ways de 30 m, 3 km contre
 * 10. Tranché par Cédric le 20/10 : **`totalMeters`**, partout où l'on
 * affiche la longueur d'un itinéraire. Le parcouru en est la part que dit le
 * pourcentage — le même chiffre, sur la même longueur.
 *
 * Les totaux qui additionnent plusieurs itinéraires (réseau, bilan) restent
 * en échantillons : un way partagé n'y compte qu'une fois, ce que la somme
 * des `totalMeters` ne saurait pas faire.
 */
export function longueursDeLItineraire(
  itin: Itinerary,
  resultat: CompletionResult | undefined,
): { total: number; fait: number } {
  const total = itin.totalMeters
  return { total, fait: resultat ? (resultat.pct / 100) * total : 0 }
}
