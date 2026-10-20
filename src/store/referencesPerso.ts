import type { ParcoursDeclare } from '../core/declaratif.ts'
import type { SentiersDb } from '../db/database.ts'

/**
 * Ce qui désigne un itinéraire par son numéro sans en faire partie : sa
 * déclaration « parcouru » (#158), son épingle d'objectif (#13) et les POI
 * emportés avec lui (#153).
 *
 * Supprimer un itinéraire perso n'effaçait que l'itinéraire. Le reste
 * pointait vers un numéro libre, que le distributeur redonnait au prochain
 * import après un rechargement : le nouveau venu s'ouvrait « déclaré
 * parcouru » et épinglé, sans que personne ait rien fait (#549). La liste
 * vit ici, une fois, pour que l'oubli et le distributeur en voient la même.
 */
export interface EtatReferences {
  parcoursDeclares: ParcoursDeclare[]
  objectifs: number[]
  retirerParcoursDeclare: (itineraryId: number) => Promise<void>
  basculerObjectif: (id: number) => Promise<void>
}

/** Les numéros que quelque chose désigne encore, en mémoire. */
export function numerosDesignes(etat: EtatReferences): number[] {
  return [...etat.parcoursDeclares.map((d) => d.itineraryId), ...etat.objectifs]
}

/** Oublie tout ce qui désigne `id`, en mémoire et en base. */
export async function oublierLesReferences(
  id: number,
  etat: EtatReferences,
  baseOuverte: () => Promise<SentiersDb | null>,
): Promise<void> {
  if (etat.parcoursDeclares.some((d) => d.itineraryId === id)) {
    await etat.retirerParcoursDeclare(id)
  }
  if (etat.objectifs.includes(id)) await etat.basculerObjectif(id)
  await (await baseOuverte())?.effacerPoisEmportes(id)
}
