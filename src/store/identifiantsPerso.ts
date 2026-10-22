import { AllocateurPerso } from '../core/identifiantsPerso.ts'
import type { Itinerary } from '../core/types.ts'

/**
 * Le distributeur de numéros perso du store, et l'attente du démarrage
 * (#543).
 *
 * Un seul distributeur pour l'import, le tracé et la sauvegarde : chacun en
 * calculait un à partir de ce qu'il voyait, et deux actions lancées ensemble
 * recevaient le même numéro. Il ne se consulte qu'une fois les itinéraires
 * de la base lus — avant, la mémoire est vide, −1 peut y être déjà pris, et
 * le `put` de l'import écrasait celui de la session précédente.
 *
 * Sorti d'`appStore.ts`, qui passait de 1 088 à 1 112 lignes pour un
 * plafond de 1 105 : c'est une règle à part entière, pas de la composition.
 */
export function creerIdentifiantsPerso(
  persos: () => Itinerary[],
  /** Les numéros encore désignés par une déclaration ou un objectif (#549). */
  designes: () => readonly number[] = () => [],
) {
  let allocateur = new AllocateurPerso()
  let lecture: Promise<void> | null = null

  /**
   * À appeler à l'ouverture de la base. Rend la fonction qui dit « les
   * itinéraires de la base sont en mémoire » ; l'appeler deux fois est sans
   * effet. Elle reçoit les numéros que la base seule désigne encore — ceux
   * des POI emportés, qui ne vivent pas en mémoire (#549).
   */
  function lectureCommencee(): (enBase?: readonly number[]) => void {
    let faite = (): void => {}
    allocateur = new AllocateurPerso()
    const celuiCi = allocateur
    lecture = new Promise<void>((resolve) => {
      faite = resolve
    })
    return (enBase = []) => {
      celuiCi.observerRelations(enBase)
      faite()
    }
  }

  /**
   * Le distributeur, à jour de ce qui est en mémoire. Rend la main sans
   * attendre si l'ouverture n'a jamais commencé — un store dont `init()` n'a
   * pas été appelé ne doit pas se figer, comme pour `baseOuverte`.
   */
  async function identifiantsPerso(): Promise<AllocateurPerso> {
    if (lecture) await lecture
    allocateur.observer(persos())
    allocateur.observerRelations(designes())
    return allocateur
  }

  return { lectureCommencee, identifiantsPerso }
}
