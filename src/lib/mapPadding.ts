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

/**
 * La marge basse que réservent plusieurs surfaces posées sur la carte : la
 * plus haute l'emporte. Chacune suit la règle de `margeBassePanneau` — un
 * crédit replié en « ⓘ », étroit, ne réserve donc rien.
 *
 * Née le 11/11 (#668) : le crédit déplié tient désormais au téléphone,
 * au-dessus de la feuille, et le sud d'une zone cadrée tombait dessous.
 */
export function margeBasseRecouverte(
  cadre: Rect,
  surfaces: readonly (Rect | null | undefined)[],
): number {
  return Math.max(0, ...surfaces.map((s) => margeBassePanneau(cadre, s)))
}

/**
 * La marge basse qu'un cadrage peut réellement réserver, ou zéro.
 *
 * #704, mesuré le 23/11 au doigt, à 390 × 844 : feuille pleine, la carte va
 * de 60 à 844 px et la feuille commence à 84 px. Réserver ses 760 px sous les
 * deux bords de 48 px laissait une hauteur négative à cadrer : MapLibre
 * refuse alors de bouger (« Map cannot fit within canvas… », lu dans son
 * `cameraForBounds` : il abandonne dès que la hauteur restante est négative),
 * et la caméra restait sur la zone d'avant — même une fois la feuille
 * repliée, puisque rien ne recadre à ce moment-là.
 *
 * Une marge que la carte ne peut pas céder n'est donc pas réservée : la zone
 * se cadre sur la carte entière, et elle est à l'écran dès que la feuille
 * descend. La limite n'est pas un seuil choisi : c'est celle où il ne reste
 * plus rien à cadrer — zéro compris, où l'échelle s'annule et le zoom part à
 * moins l'infini.
 *
 * Ce que la règle ne fait pas, et qu'il faut savoir (relecture adverse) :
 * elle est **discontinue**. Un reste positif mais minuscule — quelques
 * pixels — est honoré tel quel, comme avant ce correctif, et cadre la zone
 * à un zoom très bas. Le borner par un reste minimal changerait ce qui est
 * cadré : ce serait un seuil à décider, pas à inventer (CLAUDE.md §2). Le
 * cas mesuré (#704) n'en a pas besoin. Savoir si la feuille devrait se
 * replier d'elle-même après le choix d'une zone est une autre question, de
 * présentation.
 */
export function margeBasseCadrable(cadre: Rect, bord: number, recouvre: number): number {
  const reste = cadre.bottom - cadre.top - 2 * bord - recouvre
  return reste > 0 ? recouvre : 0
}
