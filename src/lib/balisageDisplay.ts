import { BLANC_BALISAGE } from './couleursPartagees.ts'
import { COULEURS, lireBalisage } from '../core/balisage.ts'

/**
 * Dessiner la balise plutôt que la décrire (issue #381).
 *
 * ## Pourquoi trois figures et pas vingt-trois
 *
 * `src/core/balisage.ts` sait nommer dix-sept formes. Le terrain en emploie
 * bien moins : mesuré le 29/08 sur 26 relations `route=hiking` du Pilat, de
 * la Loire et de l'ouest lyonnais, dont **18 portent un `osmc:symbol`** —
 *
 * | forme | occurrences |
 * |---|---|
 * | moitiés `upper` + `lower` | 12 |
 * | `bar` | 3 |
 * | `crest` | 2 |
 * | `shell_modern` | 1 |
 *
 * Trois figures couvrent **17 des 18**. La table des formes reste complète
 * pour la *description* — c'est elle qui permet de rendre `null` plutôt que
 * d'inventer — mais le *dessin* n'a besoin que de ces trois-là.
 *
 * ## Ce que ce module refuse de faire
 *
 * Approcher. Une forme qu'il ne sait pas dessiner rend `null`, et la fiche
 * garde sa phrase seule. **Un dessin affirme plus fort qu'une phrase** :
 * « arche jaune sur fond blanc » laisse au lecteur le soin d'imaginer, une
 * arche mal dessinée lui montre du faux avec l'autorité d'une image.
 *
 * C'est la discipline de `lireBalisage`, transposée : rendre rien plutôt
 * qu'à peu près.
 */

/**
 * De quoi peindre une marque, par nom de couleur `osmc:symbol`.
 *
 * **Ces valeurs sont choisies**, et le §2 demande de le dire. Ce ne sont pas
 * des mesures : aucune norme ne fixe le jaune d'un balisage de pays, qui
 * varie d'un pot de peinture à l'autre. Le repère retenu est la lisibilité
 * sur fond clair comme sur fond sombre, à la taille d'une ligne de texte.
 *
 * Deux valeurs ne sont pas choisies ici et viennent d'ailleurs :
 *
 * - le blanc est `BLANC_BALISAGE`, déjà nommé parce que « c'est une couleur
 *   de peinture sur un rocher », pas le blanc cassé du papier ;
 * - le rouge est celui que la carte emploie déjà pour les GR. Les deux
 *   régimes — taxonomie fédérale et marque peinte — restent distincts
 *   (#290), mais rien ne gagnerait à ce qu'un même GR soit d'un rouge sur la
 *   ligne et d'un autre sur sa balise.
 */
export const PEINTURE: Record<string, string> = {
  red: '#c8102e',
  blue: '#1d5fa8',
  green: '#2e7d3a',
  yellow: '#f2b705',
  orange: '#d97a06',
  black: '#1c1c1c',
  white: BLANC_BALISAGE,
  brown: '#7a4a24',
  purple: '#6b3fa0',
  gray: '#7c837c',
  grey: '#7c837c',
}

/** Une figure dessinable, et rien d'autre. */
export type Figure =
  | { genre: 'moities'; haut: string; bas: string; fond: string | null }
  | { genre: 'barre'; couleur: string; fond: string | null }
  | { genre: 'crete'; couleur: string; fond: string | null }

/** La couleur peinte d'un champ `couleur_forme`, si on sait la peindre. */
function couleurDe(champ: string): string | null {
  const nom = /^([a-z]+)_/.exec(champ)?.[1]
  return nom !== undefined ? (PEINTURE[nom] ?? null) : null
}

/** La forme d'un champ `couleur_forme`. */
function formeDe(champ: string): string | null {
  return /^[a-z]+_([a-z_]+)$/.exec(champ)?.[1] ?? null
}

/**
 * La figure à peindre pour une balise, ou `null` quand on ne sait pas.
 *
 * Le fond peut être absent (`null`) : `red::white_upper:red_lower` n'a pas
 * de cartouche, et en inventer un serait dessiner une pastille que personne
 * n'a peinte.
 */
export function figureDuBalisage(tag: string | undefined): Figure | null {
  const lu = lireBalisage(tag)
  if (!lu) return null

  const fond = lu.fond === '' ? null : (PEINTURE[lu.fond] ?? null)
  // Un fond nommé qu'on ne sait pas peindre : on renonce, plutôt que de
  // dessiner la marque sur un cartouche de la mauvaise couleur.
  if (lu.fond !== '' && fond === null) return null

  const forme = formeDe(lu.premierPlan)
  const couleur = couleurDe(lu.premierPlan)
  if (forme === null || couleur === null) return null

  /*
    La balise en deux moitiés — `white_upper:red_lower`, la marque des GR et
    des GRP, et de loin la plus fréquente. Les deux champs doivent tous deux
    se lire : une moitié inconnue rendrait une balise à moitié fausse.
  */
  if (forme === 'upper' && lu.secondPlan !== null) {
    const bas = couleurDe(lu.secondPlan)
    if (formeDe(lu.secondPlan) !== 'lower' || bas === null) return null
    return { genre: 'moities', haut: couleur, bas, fond }
  }

  if (forme === 'bar') return { genre: 'barre', couleur, fond }
  if (forme === 'crest') return { genre: 'crete', couleur, fond }

  return null
}

/**
 * Les couleurs qu'on sait nommer et celles qu'on sait peindre sont la même
 * liste — écrite deux fois, dans deux modules qui ne changent jamais
 * ensemble. `tests/unit/balisageDessin.test.ts` les compare (§4ter).
 */
export const COULEURS_NOMMEES = COULEURS
