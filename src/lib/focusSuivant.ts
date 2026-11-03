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

/**
 * Atteignable au clavier, et affiché. `checkVisibility` manque à jsdom et à
 * Safari avant la 17.4 (2024) ; sans lui, l'élément est pris tel quel. Il ne
 * voit pas non plus un ancêtre en `overflow: hidden` ou `inert` (§1bis) :
 * ce qui suit un avis qu'on vient de cliquer est dans une feuille ouverte.
 */
function atteignable(candidat: HTMLElement): boolean {
  if (!candidat.isConnected || candidat.matches('[tabindex="-1"]')) return false
  const visible = (candidat as { checkVisibility?: () => boolean }).checkVisibility
  return !visible || visible.call(candidat)
}

/** Tout ce que le clavier atteindrait après `element`, hors de lui, dans l'ordre. */
function focusablesSuivants(element: HTMLElement): HTMLElement[] {
  return [...element.ownerDocument.querySelectorAll<HTMLElement>(FOCALISABLES)].filter(
    (c) =>
      !element.contains(c) &&
      atteignable(c) &&
      (element.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
}

export function focusableSuivant(element: HTMLElement): HTMLElement | null {
  return focusablesSuivants(element)[0] ?? null
}

/**
 * Ferme ce que porte `element`, et rend le focus à ce qui le suit.
 *
 * Les candidats se repèrent avant `fermer`, puisqu'après, `element` a quitté
 * le document. Le focus va au premier qui y est encore quand `fermer` a
 * fini, promesse comprise : « Quitter la démonstration » démonte le tableau
 * de bord qui suivait l'avis dans l'onglet « Progression », et un `focus()`
 * sur un nœud détaché laissait BODY (relecture adverse du 03/11). Dans
 * l'ordre : un suivant encore là dans le conteneur de l'avis, sinon ce que
 * ce conteneur contient maintenant, et seulement ensuite ce qui suit
 * ailleurs — le focus reste où l'on lisait.
 *
 * Et seulement si le focus est encore perdu : « Quitter » attend la
 * relecture de la base, et qui a bougé entre-temps garde sa place.
 *
 * Les deux boutons de la démonstration passent par ici plutôt que de
 * recopier cet ordre (§4).
 */
export function fermerEnRendantLeFocus(
  element: HTMLElement | null,
  fermer: () => unknown,
): void {
  const candidats = element ? focusablesSuivants(element) : []
  const conteneur = element?.parentElement ?? null
  void Promise.resolve(fermer()).finally(() => {
    const actif = document.activeElement
    if (actif && actif !== document.body) return
    const dansLeConteneur = (c: HTMLElement) => conteneur?.contains(c) === true
    const cible =
      candidats.find((c) => dansLeConteneur(c) && atteignable(c)) ??
      [...(conteneur?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])].find(atteignable) ??
      candidats.find(atteignable)
    cible?.focus()
  })
}
