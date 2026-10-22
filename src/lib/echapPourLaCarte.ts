/**
 * Échap revient-il à la carte — désélectionner, fermer la fiche ?
 *
 * Pas quand il sert déjà à autre chose (#568, point 2). `MapView.tsx`
 * écoutait `keydown` sur `window` sans rien regarder d'autre que la touche :
 * fiche ouverte, puis « À propos », puis Échap, la fiche se fermait en plus
 * de la boîte de dialogue ; en tapant un nom de commune, Échap pour effacer
 * fermait la fiche aussi.
 */
export function echapPourLaCarte(evenement: KeyboardEvent): boolean {
  if (evenement.key !== 'Escape' || evenement.defaultPrevented) return false
  // Une boîte modale ouverte prend Échap pour elle (le navigateur la ferme).
  if (document.querySelector('dialog[open]')) return false
  const cible = evenement.target
  if (
    cible instanceof HTMLElement &&
    (cible.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName))
  ) {
    return false
  }
  return true
}
