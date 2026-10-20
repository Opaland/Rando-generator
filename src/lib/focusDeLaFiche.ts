import { useEffect, useRef, type RefObject } from 'react'

/**
 * Le focus suit la fiche : il y entre quand elle s'ouvre, et revient d'où il
 * venait quand elle se ferme (#568, point 1 ; WCAG 2.4.3).
 *
 * Ouverte par Entrée puis fermée par Échap ou par la croix, la fiche
 * laissait `document.activeElement` sur `BODY` dans les deux sens : au
 * clavier, on repartait du haut de la page à chaque fiche.
 *
 * Au retour, l'élément qui avait ouvert la fiche n'existe souvent plus :
 * la fiche remplace la carte d'itinéraire tant qu'elle est ouverte, et le
 * lien « fiche » est **recréé** à la fermeture — même `data-testid`, autre
 * nœud. On le retrouve par ce nom. Et s'il ne revient pas — Échap
 * désélectionne, la carte disparaît —, le focus revient sur la ligne de
 * l'itinéraire dans la liste, qui porte `data-itineraire`.
 */
export function useFocusDeLaFiche(
  ouverte: number | null,
  panneau: RefObject<HTMLElement | null>,
): void {
  const retour = useRef<HTMLElement | null>(null)
  const precedente = useRef<number | null>(null)
  /*
    Le dernier élément focalisé **avant** l'ouverture, retenu au fil de
    l'eau. Lu à l'ouverture, `document.activeElement` vaut déjà `BODY` : le
    lien qui ouvre la fiche est retiré du DOM dans le même rendu que celui
    où la fiche apparaît — mesuré, c'est pourquoi le premier essai rendait
    toujours le focus à la liste.
  */
  const dernierFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const noter = (evenement: FocusEvent) => {
      if (precedente.current === null && evenement.target instanceof HTMLElement) {
        dernierFocus.current = evenement.target
      }
    }
    document.addEventListener('focusin', noter)
    return () => {
      document.removeEventListener('focusin', noter)
    }
  }, [])

  useEffect(() => {
    const avant = precedente.current
    precedente.current = ouverte
    if (avant === null && ouverte !== null) {
      retour.current = dernierFocus.current
      panneau.current?.focus({ preventScroll: true })
      return
    }
    if (avant !== null && ouverte === null) {
      const origine = retour.current
      retour.current = null
      /*
        Au cadre suivant, pas tout de suite : la carte d'itinéraire revient
        dans un rendu **postérieur** à la fermeture de la fiche. Mesuré : au
        moment de cet effet, le lien recréé n'existait pas encore, et le
        focus tombait sur la ligne de la liste alors que le lien était là
        une demi-seconde plus tard.
      */
      const cadre = requestAnimationFrame(() => {
        const nom = origine?.dataset.testid
        const cible =
          (origine?.isConnected === true ? origine : null) ??
          (nom
            ? document.querySelector<HTMLElement>(`[data-testid="${nom}"]`)
            : null) ??
          document.querySelector<HTMLElement>(
            `[data-itineraire="${String(avant)}"]`,
          )
        cible?.focus({ preventScroll: true })
      })
      return () => {
        cancelAnimationFrame(cadre)
      }
    }
    return undefined
  }, [ouverte, panneau])
}
