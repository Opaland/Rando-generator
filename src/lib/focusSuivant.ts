/**
 * L'élément que le clavier atteindrait juste après `element`, hors de lui —
 * ou `null`.
 *
 * Un bouton qui disparaît avec ce qu'il ferme laissait le focus sur `BODY` :
 * au clavier, on repartait du haut de la page (#658, WCAG 2.4.3). Il se
 * repère **avant** la disparition, puisqu'après, `element` n'est plus dans le
 * document.
 *
 * Pourquoi la suite et non l'élément qui avait déclenché l'avis : celui de la
 * démonstration est un geste quelconque (choisir une zone, importer), qu'on
 * ne connaît pas, et la suite du document est celle de la lecture. Écartée
 * aussi : un conteneur en `tabindex="-1"`, qui rend le focus sans rendre de
 * cible utilisable (§2, choix de présentation).
 */
const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableSuivant(element: HTMLElement): HTMLElement | null {
  for (const candidat of element.ownerDocument.querySelectorAll<HTMLElement>(FOCALISABLES)) {
    if (element.contains(candidat)) continue
    if (candidat.matches('[tabindex="-1"]')) continue
    // Masqué (une section repliée, `display: none`) : il refuserait le focus,
    // qui retomberait sur `BODY`. `checkVisibility` manque à jsdom et aux
    // navigateurs d'avant 2023 ; sans lui, le candidat est pris tel quel.
    const visible = (candidat as { checkVisibility?: () => boolean }).checkVisibility
    if (visible && !visible.call(candidat)) continue
    if (element.compareDocumentPosition(candidat) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return candidat
    }
  }
  return null
}

/**
 * Ferme ce que porte `element`, et rend le focus à ce qui le suit.
 *
 * La suite se repère avant `fermer`, puisqu'après, `element` a quitté le
 * document ; le focus lui est rendu quand `fermer` a fini, promesse
 * comprise. Les deux boutons de la démonstration passent par ici plutôt que
 * de recopier l'ordre des deux temps (§4).
 */
export function fermerEnRendantLeFocus(
  element: HTMLElement | null,
  fermer: () => unknown,
): void {
  const suite = element ? focusableSuivant(element) : null
  void Promise.resolve(fermer()).finally(() => {
    suite?.focus()
  })
}
