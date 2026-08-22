import type { ElevationProfile } from './types.ts'

/**
 * La pente d'un itinéraire, dite avec sa résolution (issue #179).
 *
 * Farid, mobilité réduite, et Nadia et Yann avec une poussette butent sur la
 * même absence. L'issue pose la règle qui commande tout ce module :
 *
 * > Se tromper ici ne coûte pas une déception : ça envoie quelqu'un en
 * > fauteuil ou avec une poussette sur un sentier impraticable.
 *
 * D'où le choix central : on ne rend **jamais** un pourcentage nu. Le profil
 * altimétrique est échantillonné à cent points au plus (`MAX_ELEVATION_POINTS`)
 * — sur un itinéraire de 20 km, cela fait un point tous les 200 mètres. Une
 * rampe de 30 mètres à 20 % disparaît entièrement dans une telle moyenne.
 *
 * Le chiffre reste utile pour qui pousse une poussette ou roule : une moyenne
 * de 12 % sur 200 m est un mur, quelle que soit la finesse. Mais il doit être
 * présenté comme ce qu'il est, et `libellePente` est là pour que personne ne
 * puisse l'afficher autrement.
 */

export interface Pente {
  /** Pente en pourcentage, toujours positive : une descente est une pente. */
  pourcent: number
  /** Longueur du segment sur lequel cette moyenne a été faite, en mètres. */
  surMetres: number
}

/**
 * La plus forte pente moyenne entre deux points d'altitude connus.
 *
 * Les altitudes manquantes ne sont ni interpolées — ce serait inventer une
 * pente — ni comptées comme du plat — ce serait inventer un plat. Le segment
 * enjambe simplement le trou, et sa longueur le dit.
 */
export function penteMaximale(profil: ElevationProfile): Pente | null {
  let precedent: { distance: number; altitude: number } | null = null
  let meilleure: Pente | null = null

  for (let i = 0; i < profil.distances.length; i += 1) {
    const distance = profil.distances[i]
    const altitude = profil.elevations[i]
    if (typeof distance !== 'number' || typeof altitude !== 'number') continue
    if (!Number.isFinite(distance) || !Number.isFinite(altitude)) continue

    if (precedent !== null) {
      const longueur = distance - precedent.distance
      // Deux points à la même distance donneraient une division par zéro, et
      // « pente maximale : Infinity % » détruirait la confiance dans le reste.
      if (longueur > 0) {
        const denivele = Math.abs(altitude - precedent.altitude)
        const pourcent = (denivele / longueur) * 100
        if (meilleure === null || pourcent > meilleure.pourcent) {
          meilleure = { pourcent, surMetres: longueur }
        }
      }
    }
    precedent = { distance, altitude }
  }

  return meilleure
}

/**
 * La phrase qui accompagne le chiffre — et qui ne doit jamais être remplacée
 * par le chiffre seul.
 *
 * « Pente maximale 6 % » se lit « nulle part plus de 6 % ». C'est faux à cette
 * résolution, et faux au détriment de quelqu'un qui en dépend pour décider
 * de s'engager ou non.
 */
export function libellePente(pente: Pente): string {
  const pourcent = pente.pourcent.toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })
  const sur = Math.round(pente.surMetres / 10) * 10
  return `jusqu’à ${pourcent} % en moyenne sur ${sur} m — une rampe plus courte et plus raide ne se verrait pas à cette résolution.`
}
