/**
 * Ce clic prolonge-t-il un double-clic ?
 *
 * Pour les commandes dont le second temps apparaît **au même endroit** que
 * le premier : sans cette garde, le deuxième clic d'un double-clic
 * confirmait aussitôt, et une trace partait sans confirmation (#551).
 * `detail` compte les clics rapprochés selon le délai que le système de la
 * personne a réglé — aucun seuil n'est donc inventé ici (CLAUDE.md §2). Le
 * clavier rend 0, et n'est pas touché.
 */
export function prolongeUnDoubleClic(event: { detail: number }): boolean {
  return event.detail > 1
}
