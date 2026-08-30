/**
 * Les couleurs de base que MapLibre et le CSS peignent toutes les deux.
 *
 * `docs/DESIGN_SYSTEM.md` explique pourquoi ces valeurs existent forcément en
 * double : MapLibre ne lit pas les propriétés personnalisées CSS, et une
 * feuille de style ne lit pas une constante JavaScript. Ce qui n'est pas
 * inévitable, c'est qu'elles soient **recopiées à la main** — et elles
 * l'étaient : six `#1e2b23`, trois `#faf7f2`, trois `#ffffff` disséminés
 * dans `map/style.ts` et `summaryCard.ts`, plus un `#c1272d` qui ne
 * correspondait à aucun jeton.
 *
 * Une valeur consultée par plusieurs endroits se nomme, elle ne se recopie
 * pas (CLAUDE.md §4). `tests/unit/couleurs.test.ts` compare chacune à son
 * jeton CSS : la duplication reste, la divergence non.
 */

/**
 * `--blanc-papier` : le fond **de la carte**, et le liseré des pastilles.
 *
 * C'était aussi le fond de l'interface, jusqu'à #361. Les deux rôles ont
 * maintenant deux noms : l'interface peint avec `--papier`, qui vaut la même
 * chose en thème clair et changera en sombre — le fond de l'IGN, lui, reste
 * clair quoi qu'il arrive.
 */
export const PAPIER = '#faf7f2'

/**
 * `--vert-noir` : la couleur du réseau PERSO sur la carte.
 *
 * C'était aussi l'encre de l'interface, jusqu'à #361 — un jeton pour deux
 * rôles, ce qui tient tant qu'un seul des deux bouge. L'interface écrit
 * maintenant avec `--encre`.
 */
export const ENCRE = '#1e2b23'

/**
 * `--gris-vert` : le repli de MapLibre pour une valeur qui n'est pas un
 * réseau. Le texte secondaire de l'interface, lui, s'écrit en `--encre-douce`
 * depuis #361.
 *
 * Cette phrase disait aussi « et les tracés sans réseau connu ». C'était vrai
 * quand elle a été écrite, et faux depuis #412 : un tracé sans réseau déclaré
 * se peint désormais de sa propre couleur, `--prune-inconnu`, comme son badge
 * et son entrée de légende. Le gris ne reste ici que comme repli d'un `match`
 * MapLibre, pour une valeur qui ne serait pas un réseau — c'est-à-dire pour
 * rien de ce que l'application produit.
 *
 * C'est le §4bis : une justification vieillit comme le reste, et celle-ci
 * décrivait le défaut plutôt que l'intention.
 */
export const GRIS_VERT = '#5a6b5d'

/**
 * `--blanc-balisage` : le blanc pur du balisage GR, qui n'est pas le blanc
 * cassé du papier. Les deux se ressemblent à l'écran et disent des choses
 * différentes : celui-ci est une couleur de peinture sur un rocher.
 */
export const BLANC_BALISAGE = '#fff'
