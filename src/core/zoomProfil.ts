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

/**
 * Fait glisser la fenêtre juste assez pour qu'elle contienne un point.
 *
 * Trouvaille de la revue du sprint 6. Le curseur du profil est borné au
 * parcours entier, pas à la fenêtre visible : au clavier, une frappe `End`
 * sur une fenêtre zoomée sur 0,9–1,5 km portait le curseur à 2,3 km. Mesuré
 * sur l'application déployée, le cercle était alors dessiné à `cx = 784`
 * dans un `viewBox` large de 320 — écrêté, invisible — pendant que la
 * lecture sous le graphique et le marqueur sur la carte continuaient
 * d'avancer. On naviguait à l'aveugle.
 *
 * La fenêtre suit donc le curseur plutôt que l'inverse : borner le curseur
 * à la fenêtre a été envisagé et écarté, parce que `End` et `Home` doivent
 * mener aux extrémités du parcours, pas à celles de ce qu'on regarde.
 *
 * La largeur est conservée à l'identique : suivre n'est pas un zoom.
 *
 * Le point est ramené dans le parcours en entrée, et non la fenêtre en
 * sortie : les deux butées écrites d'abord sur `debut` étaient inatteignables
 * — un point déjà dans le parcours ne peut pas en faire sortir une fenêtre
 * qu'on colle contre lui. Une mutation les a supprimées sans qu'aucun test
 * ne bronche (CLAUDE.md §6bis) ; les rendre inutiles valait mieux que de les
 * garder pour la forme.
 */
export function suivre(
  fenetre: Fenetre,
  totalMetres: number,
  distanceMetres: number,
): Fenetre {
  const point = Math.min(Math.max(distanceMetres, 0), Math.max(totalMetres, 0))
  if (point >= fenetre.debut && point <= fenetre.fin) return fenetre
  const largeur = fenetre.fin - fenetre.debut
  const debut = point < fenetre.debut ? point : point - largeur
  return { debut, fin: debut + largeur }
}
