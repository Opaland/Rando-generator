import type { Itinerary, Network } from './types.ts'

/**
 * Ce que la légende de carte a réellement à nommer (issue #145, AUDIT_UX.md
 * constat U6).
 *
 * Elle nommait les cinq réseaux et les deux états, toujours, quelle que soit
 * la carte affichée. Mesuré sur un téléphone : 100 px sur les 350 de carte
 * visible, soit 28 %, en permanence, et en haut — là où le tracé se trouve
 * après un cadrage. Six entrées, dont la moitié ne concernait pas la zone.
 *
 * Une légende qui nomme des couleurs absentes de la carte n'aide pas à
 * lire : elle occupe de la place pour dire ce qui n'est pas là.
 *
 * **La légende ne nomme que ce qui est dessiné.** C'est la seule règle, et
 * elle vit ici plutôt que dans le composant : le tri des réseaux, la
 * distinction parcouru/restant et le cas de la carte vide s'éprouvent sans
 * DOM, et se cassent en silence quand on les laisse dans un rendu.
 */

/**
 * L'ordre de la charte, et non celui d'arrivée des données.
 *
 * Une légende dont les entrées changent de place selon la zone chargée se
 * relit à chaque fois. L'ordre suit celui de `NETWORK_LABELS` : du réseau le
 * plus structurant au plus local, puis ce que la personne a tracé.
 */
const ORDRE: readonly Network[] = ['GR', 'GRP', 'PR', 'LOCAL', 'PERSO']

export interface ContenuLegende {
  /** Les réseaux présents sur la carte, dans l'ordre de la charte. */
  reseaux: Network[]
  /**
   * Faut-il distinguer parcouru et restant ?
   *
   * Tant qu'aucune trace n'est importée, tout est restant : la distinction
   * occupe une ligne pour n'apprendre rien.
   */
  etats: boolean
  /** Vrai quand il n'y a rien à nommer — la légende n'a alors pas à être là. */
  vide: boolean
}

export function contenuLegende({
  itineraires,
  itinerairesPerso,
  aDesTraces,
}: {
  itineraires: Itinerary[]
  itinerairesPerso: Itinerary[]
  aDesTraces: boolean
}): ContenuLegende {
  const presents = new Set<Network>()
  for (const itineraire of [...itineraires, ...itinerairesPerso]) {
    presents.add(itineraire.network)
  }
  const reseaux = ORDRE.filter((network) => presents.has(network))
  return {
    reseaux,
    etats: aDesTraces,
    vide: reseaux.length === 0 && !aDesTraces,
  }
}
