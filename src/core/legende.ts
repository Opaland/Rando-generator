import type { Itinerary, Network } from './types.ts'
import { ORDRE_DES_RESEAUX } from './reseaux.ts'
import {
  segmentsDeRevetement,
  type FamilleRevetement,
} from './revetement.ts'

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
 * L'ordre des familles de terrain : du plus roulant au moins roulant, comme
 * on les rencontre en descendant d'une route vers un sentier. « Autre » ferme
 * la marche, parce qu'il ne dit rien de la surface.
 */
export const ORDRE_TERRAIN: readonly FamilleRevetement[] = [
  'dur',
  'stabilise',
  'naturel',
  'autre',
]

export interface ContenuLegende {
  /** Les réseaux présents sur la carte, dans l'ordre de la charte. */
  reseaux: Network[]
  /**
   * Les familles de revêtement que la bande de terrain peint réellement.
   *
   * Vide tant qu'aucune fiche n'est ouverte : la bande n'existe que pour
   * l'itinéraire qu'on regarde. Nommer les cinq familles en permanence
   * referait le constat U6 — des entrées qui ne concernent pas ce qui est
   * à l'écran, occupant la carte pour rien.
   */
  terrains: FamilleRevetement[]
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
  itineraireRegarde = null,
}: {
  itineraires: Itinerary[]
  itinerairesPerso: Itinerary[]
  aDesTraces: boolean
  /** L'itinéraire dont la fiche est ouverte, seul à porter une bande. */
  itineraireRegarde?: number | null
}): ContenuLegende {
  const tous = [...itineraires, ...itinerairesPerso]
  const presents = new Set<Network>()
  for (const itineraire of tous) {
    presents.add(itineraire.network)
  }
  const reseaux = ORDRE_DES_RESEAUX.filter((network) => presents.has(network))

  const regarde = tous.find((i) => i.osmRelationId === itineraireRegarde)
  const famillesPeintes = new Set<FamilleRevetement>()
  if (regarde) {
    for (const segment of segmentsDeRevetement(regarde)) {
      // « Inconnu » veut dire qu'on ne sait rien : une légende ne nomme pas
      // l'ignorance, et la carte ne la peint pas non plus.
      //
      // Le test est écrit ici en vocabulaire du domaine plutôt qu'en
      // consultant la table des couleurs : `core` ne dépend pas de `lib`,
      // et l'inverser ferait descendre une décision d'affichage dans le
      // calcul. Les deux listes sont comparées par
      // `tests/unit/terrainCouleurs.test.ts`, qui échoue si elles divergent.
      if (segment.famille === 'inconnu') continue
      famillesPeintes.add(segment.famille)
    }
  }
  const terrains = ORDRE_TERRAIN.filter((f) => famillesPeintes.has(f))

  return {
    reseaux,
    terrains,
    etats: aDesTraces,
    vide: reseaux.length === 0 && !aDesTraces && terrains.length === 0,
  }
}
