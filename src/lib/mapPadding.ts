/** Rectangle réduit à ce dont le calcul a besoin (compatible DOMRect). */
export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

/**
 * Marge basse à réserver dans un cadrage de carte pour un panneau posé
 * dessus.
 *
 * Un panneau ne gêne le cadrage que s'il barre la carte : sur téléphone la
 * fiche détail occupe toute la largeur en bas, et sans marge le tracé dont on
 * lit la fiche se retrouve dessous (issue #80). Sur grand écran elle flotte
 * dans un coin sur 380 px — compter sa hauteur comme une marge tasserait
 * l'itinéraire dans le haut de l'écran pour une gêne qui n'existe pas.
 *
 * Le seuil est délibérément haut : entre les deux dispositions il n'y a pas
 * de cas intermédiaire, et mieux vaut ne rien réserver que réserver à tort.
 */
export const PART_LARGEUR_GENANTE = 0.8

export function margeBassePanneau(
  cadre: Rect,
  panneau: Rect | null | undefined,
): number {
  if (!panneau || cadre.width <= 0) return 0
  const largeurGenee =
    Math.min(panneau.right, cadre.right) - Math.max(panneau.left, cadre.left)
  if (largeurGenee <= cadre.width * PART_LARGEUR_GENANTE) return 0
  // Seulement la part du panneau qui mord sur la carte : il peut la dépasser.
  return Math.max(0, cadre.bottom - Math.max(panneau.top, cadre.top))
}
