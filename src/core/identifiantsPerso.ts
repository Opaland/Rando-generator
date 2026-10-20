import type { Itinerary } from './types.ts'

/**
 * Le seul distributeur des numéros d'itinéraires et de chemins perso (#543).
 *
 * Les itinéraires perso portent des numéros négatifs, pour ne jamais croiser
 * ceux d'OpenStreetMap. Quatre fonctions en distribuaient chacune à partir
 * de ce qu'elle voyait au moment de regarder — l'import, le tracé, la
 * restauration d'une sauvegarde, et le calcul du « prochain » numéro — et
 * aucune ne savait ce que les autres venaient de donner. Deux actions
 * lancées avant que l'une ait déposé son résultat recevaient le même
 * numéro ; le tracé réutilisait le sien comme numéro de chemin, dans la
 * plage de ceux de l'import.
 *
 * Un numéro de relation en double écrase un itinéraire en base (`put`) ; un
 * numéro de chemin en double fait dessiner un tronçon avec les coordonnées
 * d'un autre (#440). Les deux plages sont tenues à part, et ce qui a été
 * donné une fois ne se redonne plus, que la liste observée le sache ou non.
 *
 * Ce que l'allocateur ne sait pas faire : voir ce qui est en base sans être
 * en mémoire. C'est au magasin de ne le consulter qu'une fois la base lue.
 */
export class AllocateurPerso {
  private readonly relations = new Set<number>()
  private readonly chemins = new Set<number>()
  private plusBasseRelation = 0
  private plusBasChemin = 0

  /** Prend connaissance de numéros en usage, sans rien distribuer. */
  observer(itineraires: readonly Itinerary[]): void {
    for (const itineraire of itineraires) {
      this.marquerRelation(itineraire.osmRelationId)
      for (const way of itineraire.ways) this.marquerChemin(way.osmWayId)
    }
  }

  /**
   * Prend connaissance de numéros de relation que quelque chose désigne
   * encore sans itinéraire derrière — une déclaration ou un objectif laissés
   * par une suppression d'avant #549. Les redonner les transmettrait.
   */
  observerRelations(ids: readonly number[]): void {
    for (const id of ids) this.marquerRelation(id)
  }

  /** Un numéro de relation que personne n'a encore. */
  relation(): number {
    const id = this.plusBasseRelation - 1
    this.marquerRelation(id)
    return id
  }

  /** Un numéro de chemin que personne n'a encore. */
  chemin(): number {
    const id = this.plusBasChemin - 1
    this.marquerChemin(id)
    return id
  }

  /**
   * Garde `id` s'il est libre, et dit s'il l'a gardé. Sert à la sauvegarde,
   * qui conserve les numéros qu'elle apporte tant qu'ils ne gênent personne.
   */
  reserverRelation(id: number): boolean {
    if (id >= 0 || this.relations.has(id)) return false
    this.marquerRelation(id)
    return true
  }

  reserverChemin(id: number): boolean {
    if (id >= 0 || this.chemins.has(id)) return false
    this.marquerChemin(id)
    return true
  }

  private marquerRelation(id: number): void {
    if (id >= 0) return
    this.relations.add(id)
    this.plusBasseRelation = Math.min(this.plusBasseRelation, id)
  }

  private marquerChemin(id: number): void {
    if (id >= 0) return
    this.chemins.add(id)
    this.plusBasChemin = Math.min(this.plusBasChemin, id)
  }
}
