import type { FamilleRevetement } from '../core/revetement.ts'

/**
 * Le code couleur du terrain, partagé par le profil et par la carte.
 *
 * ## Ce qui n'allait pas
 *
 * Les bandes de revêtement du profil altimétrique employaient
 * `--gris-vert`, `--jaune-pr` et `--bleu-local` — c'est-à-dire, pour deux
 * d'entre elles, **les couleurs du balisage**. « Stabilisé » était peint du
 * jaune des PR, « naturel » du bleu-vert des boucles locales. Tant que ces
 * bandes vivaient sous une courbe, dans un cadre où aucun tracé n'apparaît,
 * personne ne s'en apercevait.
 *
 * Cédric a demandé le terrain **sur la carte** le 24/08. Là, la collision
 * n'est plus théorique : un liseré jaune le long d'un GR se lit comme un PR
 * qui le longe. Il fallait donc un code à lui, et le profil en profite.
 *
 * ## Les règles, mesurées
 *
 * `tests/unit/terrainCouleurs.test.ts` les tient en chiffres calculés :
 *
 * - **ΔE ≥ 20 de toute couleur de balisage et du bleu de position.** Ce sont
 *   les seules qui comptent ici : la bande est une ligne posée le long
 *   d'autres lignes, et c'est avec elles qu'elle risque d'être confondue.
 *   Les pastilles de points d'intérêt, elles, sont des disques — la
 *   confusion de forme n'existe pas ;
 * - **ΔE ≥ 20 entre les trois familles qui disent quelque chose** ;
 * - **contraste ≥ 3:1** contre le papier.
 *
 * ## « Autre » se distingue par le motif, pas par la teinte
 *
 * « Autre » est une valeur qu'OpenStreetMap connaît mais que la table ne
 * classe pas. Son travail est d'avoir l'air neutre — donc d'être grise, donc
 * d'être proche du gris de « dur ». Trois essais l'ont confirmé : la
 * rapprocher de 20 ΔE de « dur » lui faisait perdre sa neutralité.
 *
 * Elle est donc **tiretée** plutôt que recolorée. C'est une différence de
 * forme, qui tient sans la couleur — la même distinction que le témoin
 * d'enregistrement, plein en marche et creux en pause. Et « inconnu » ne
 * peint rien du tout : deux tiers d'un parcours n'ont pas de revêtement
 * renseigné, et dessiner l'ignorance la ferait passer pour une valeur.
 */
export const TERRAIN_COLORS: Record<FamilleRevetement, string | null> = {
  /** Bitume, béton, pavés : ce qui résonne sous la semelle. */
  dur: '#59636b',
  /** Gravier, calcaire compacté : une piste qu'un véhicule pourrait prendre. */
  stabilise: '#a87a30',
  /** Terre, herbe, roche, sable : le sentier. */
  naturel: '#3f6b45',
  /** Connu d'OSM, hors de la table : neutre, et tireté (voir plus haut). */
  autre: '#7c837c',
  /** Rien de renseigné : rien de peint. L'ignorance ne se colorie pas. */
  inconnu: null,
}

/** Les familles rendues en trait discontinu plutôt qu'en trait plein. */
export const TERRAIN_TIRETS: FamilleRevetement[] = ['autre']

/** Ce que la légende dit de chaque famille, en toutes lettres. */
export const TERRAIN_LABELS: Record<FamilleRevetement, string> = {
  dur: 'Revêtement dur',
  stabilise: 'Stabilisé',
  naturel: 'Naturel',
  autre: 'Autre revêtement',
  inconnu: 'Non renseigné',
}

/** Les familles qui se peignent, dans l'ordre où la légende les présente. */
export const TERRAIN_PEINTES = (
  Object.keys(TERRAIN_COLORS) as FamilleRevetement[]
).filter((famille) => TERRAIN_COLORS[famille] !== null)
