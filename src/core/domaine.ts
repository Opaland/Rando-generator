import type { LonLat } from './types.ts'

/**
 * Le domaine où la géométrie de Sentiers est juste (issue #170).
 *
 * `distanceMeters` projette en équirectangulaire et soustrait les longitudes
 * **sans tenir compte de l'enroulement**. Mesuré : un segment de 212 m à
 * cheval sur ±180°, à 17° de latitude sud, est calculé à 38 280 833 m. La
 * longueur totale, le pourcentage de complétion et le cadrage de la carte
 * deviennent absurdes — et rien ne le dit.
 *
 * Deux voies s'offraient : corriger la projection, ou borner. L'issue tranche
 * pour la borne, et elle a raison — corriger l'enroulement demanderait de
 * reprendre aussi le hachage spatial, qui découpe l'espace en carrés **de
 * degrés** ; c'est un chantier réel, à ne pas ouvrir sans besoin.
 *
 * **La borne n'est pas « la France ».** Ce serait une frontière politique
 * posée sur un défaut mathématique, et elle refuserait La Réunion, les
 * Antilles ou la Guyane — où ce calcul est parfaitement sain. Ce qu'on
 * refuse, c'est ce qu'on ne sait pas mesurer : franchir l'antiméridien, et
 * rien d'autre.
 *
 * Le second effet signalé par l'issue — le hachage spatial qui dégénère en
 * haute latitude — n'a pas eu besoin d'une borne : il a été **corrigé**. Le
 * rayon de balayage se dérive désormais de la tolérance et de la largeur
 * d'une cellule (`rayonCellules`, dans `matching.ts`). Il avait fallu trois
 * sondes pour l'exhiber : les deux premières décalaient la trace le long de
 * son propre axe, où elle traverse les mêmes cellules et où rien ne peut se
 * voir.
 */

/**
 * Ce qu'on dit quand on refuse, et ce qu'on se garde de dire.
 *
 * Pas « fichier invalide » : le fichier ne l'est pas. C'est Sentiers qui ne
 * sait pas mesurer ce tracé-là, et le dire ainsi laisse à la personne la
 * possibilité de comprendre — et de rapporter le cas, si elle marche
 * vraiment là-bas.
 */
export const MESSAGE_ANTIMERIDIEN =
  'Ce tracé franchit le méridien 180°. Sentiers calcule les distances par une ' +
  'projection qui ne sait pas franchir cette ligne : plutôt que d’afficher une ' +
  'longueur fausse, il préfère ne pas l’afficher. Écrivez-nous si vous marchez ' +
  'dans le Pacifique — ce n’est pas une limite de principe, seulement une ' +
  'limite atteinte.'

/**
 * Le tracé franchit-il l'antiméridien ?
 *
 * Le test porte sur **le pas d'un point au suivant** et non sur l'étendue du
 * tracé : deux points séparés de 100° de longitude ne franchissent rien, mais
 * un pas de plus de 180° ne peut s'expliquer que par l'enroulement — aucun
 * segment de randonnée ne fait un demi-tour du globe.
 */
export function traverseAntimeridien(coords: LonLat[]): boolean {
  for (let i = 1; i < coords.length; i++) {
    const precedent = coords[i - 1] as LonLat
    const courant = coords[i] as LonLat
    if (Math.abs(courant[0] - precedent[0]) > 180) return true
  }
  return false
}

/**
 * Rend le message à afficher si ce tracé sort du domaine, sinon `null`.
 *
 * Une fonction nommée plutôt qu'un test recopié à chaque point d'entrée :
 * c'est le remède de CLAUDE.md §4 au mode d'échec des gardes recopiées — la
 * quatrième qu'on oublie.
 */
export function verifierDomaine(coords: LonLat[]): string | null {
  return traverseAntimeridien(coords) ? MESSAGE_ANTIMERIDIEN : null
}
