/**
 * La fenêtre visible du profil altimétrique (issue #179).
 *
 * Le zoom n'est pas un confort. Mesuré sur la donnée réelle : le revêtement
 * n'est renseigné que sur un tiers de la longueur, par tronçons épars. Sur
 * un itinéraire de 450 km rendu dans 320 pixels, un tronçon renseigné de
 * 300 mètres occupe moins d'un pixel — la bande de revêtement serait un
 * confetti sans le moyen de s'en approcher.
 *
 * Toute l'arithmétique est ici plutôt que dans le composant : les bornes,
 * les butées et l'invariance du point visé s'éprouvent sans DOM, et se
 * cassent silencieusement quand on les laisse dans un gestionnaire d'événement.
 */

export interface Fenetre {
  /** Distance depuis le départ, en mètres. */
  debut: number
  fin: number
}

/**
 * En dessous de cette largeur, deux points d'altitude consécutifs sortent
 * du cadre et le graphique n'a plus rien à montrer — le profil est
 * échantillonné à cent points, soit un tous les 200 m sur 20 km.
 *
 * Seuil de présentation : il ne change rien à ce qui est calculé, seulement
 * jusqu'où on peut s'approcher. Cinquante mètres, parce que c'est l'ordre de
 * grandeur d'un tronçon de revêtement homogène le plus court qu'on
 * rencontre. Écarté : borner en fraction du total, qui autoriserait un zoom
 * absurde sur les longs itinéraires et l'interdirait sur les courts.
 */
export const LARGEUR_MIN_METRES = 50

export function fenetreEntiere(totalMetres: number): Fenetre {
  return { debut: 0, fin: totalMetres }
}

export function estZoome(fenetre: Fenetre, totalMetres: number): boolean {
  return fenetre.debut > 0 || fenetre.fin < totalMetres
}

/**
 * Resserre ou élargit la fenêtre autour d'un point, qui reste fixe.
 *
 * Le point visé ne bouge pas sous le curseur : c'est ce qui distingue un
 * zoom d'un saut. Près d'un bord, la fenêtre bute sans emporter le point
 * avec elle.
 */
export function zoomer(
  fenetre: Fenetre,
  totalMetres: number,
  facteur: number,
  centreMetres: number,
): Fenetre {
  // Un parcours plus court que la largeur minimale n'a rien à montrer de
  // plus près : le zoom y serait un geste sans effet visible, autant qu'il
  // n'en ait pas du tout.
  if (totalMetres <= LARGEUR_MIN_METRES) return fenetreEntiere(totalMetres)

  const largeurActuelle = fenetre.fin - fenetre.debut
  const largeur = Math.min(
    Math.max(largeurActuelle * facteur, LARGEUR_MIN_METRES),
    totalMetres,
  )
  const centre = Math.min(Math.max(centreMetres, 0), totalMetres)
  // La part de la fenêtre située avant le point visé est conservée : c'est
  // elle qui garantit que le point ne glisse pas.
  const partAvant =
    largeurActuelle > 0 ? (centre - fenetre.debut) / largeurActuelle : 0.5
  let debut = centre - largeur * partAvant
  if (debut < 0) debut = 0
  if (debut + largeur > totalMetres) debut = totalMetres - largeur
  return { debut, fin: debut + largeur }
}

/**
 * Glisse la fenêtre d'une fraction de sa largeur visible.
 *
 * En butant, elle s'arrête sans rétrécir : une fenêtre qui se resserre au
 * bord changerait le niveau de zoom sans qu'on l'ait demandé.
 */
export function deplacer(
  fenetre: Fenetre,
  totalMetres: number,
  fraction: number,
): Fenetre {
  const largeur = fenetre.fin - fenetre.debut
  let debut = fenetre.debut + largeur * fraction
  if (debut < 0) debut = 0
  if (debut + largeur > totalMetres) debut = Math.max(0, totalMetres - largeur)
  return { debut, fin: debut + largeur }
}
