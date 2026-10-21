/**
 * Quand renoncer au fond IGN pour celui d'OpenStreetMap (#569, point 1).
 *
 * Le compte était cumulatif : trois échecs de tuiles dans toute la session,
 * même à une heure d'écart, basculaient sur OSM jusqu'au rechargement — et
 * hors ligne, les tuiles OSM ne font pas partie de ce qu'on a emporté.
 * Tranché par Cédric le 20/10 : trois échecs **consécutifs** ; une tuile
 * reçue remet le compte à zéro. Le repli reste définitif pour la session :
 * pas de retour automatique à l'IGN (piste écartée, plus de cas à tenir
 * qu'elle n'en résout).
 */
export interface CompteurDeRepli {
  /** Note un échec ; vrai une seule fois, quand il faut replier. */
  echec: () => boolean
  /** Une tuile est arrivée : le compte repart de zéro. */
  succes: () => void
}

export function creerCompteurDeRepli(seuil: number): CompteurDeRepli {
  let consecutifs = 0
  let replie = false
  return {
    echec() {
      if (replie) return false
      consecutifs += 1
      if (consecutifs < seuil) return false
      replie = true
      return true
    },
    succes() {
      consecutifs = 0
    },
  }
}
