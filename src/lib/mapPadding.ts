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
const PART_LARGEUR_GENANTE = 0.8

/*
  Une piste essayée le 24/08, et écartée — parce qu'aucun test ne pouvait la
  distinguer de son absence.

  La fiche grandit après son ouverture : le profil altimétrique et les points
  d'intérêt sont deux appels réseau qui répondent quand ils veulent. J'ai cru
  que le cadrage, fait une seule fois, réservait donc pour un panneau à moitié
  rempli, et j'ai ajouté un paramètre `hauteurMax` lisant le plafond CSS.

  Trois injections plus tard, aucune ne rougissait — y compris en retenant
  l'altimétrie deux secondes pour fabriquer exprès la fiche lente. La raison
  est géométrique et vaut d'être écrite : sur téléphone, le contenu d'entrée
  de la fiche (titre, pourcentage, boutons) dépasse déjà son plafond, qui est
  donc atteint dès le premier rendu ; sur grand écran, la fiche ne barre pas
  la carte et cette marge vaut zéro de toute façon. Le mécanisme ne pouvait
  pas servir.

  Le vrai défaut était ailleurs : la fiche mangeait les deux tiers de la
  carte, et c'est son empreinte qui a été bornée (`ItineraryDetail.module.css`).

  Écrit ici plutôt que gardé en code : un mécanisme qu'aucun test ne
  distingue de son absence est une affirmation sans preuve, et il vieillira
  comme telle (CLAUDE.md §4bis).
*/

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
