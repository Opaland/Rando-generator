/**
 * Interpolations d'animation — la partie calculable, isolée du DOM.
 *
 * Une barre de progression qui glisse pendant qu'un pourcentage saute d'un
 * coup à côté d'elle donne l'impression que les deux ne parlent pas du même
 * chiffre. Le compteur rattrape donc la barre, sur la même durée.
 */

/**
 * Adoucissement « ease-out » : rapide au début, posé à l'arrivée. C'est le
 * mouvement d'un objet qui s'arrête, pas d'un moteur qu'on coupe.
 */
export function easeOut(t: number): number {
  const borne = Math.min(Math.max(t, 0), 1)
  return 1 - (1 - borne) * (1 - borne)
}

/**
 * Valeur intermédiaire entre `from` et `to` après `elapsed` ms sur `duration`.
 * Une durée nulle ou négative arrive directement à destination — mieux vaut
 * afficher la bonne valeur que diviser par zéro.
 */
export function animatedValue(
  from: number,
  to: number,
  elapsed: number,
  duration: number,
): number {
  if (duration <= 0 || elapsed >= duration) return to
  if (elapsed <= 0) return from
  return from + (to - from) * easeOut(elapsed / duration)
}
