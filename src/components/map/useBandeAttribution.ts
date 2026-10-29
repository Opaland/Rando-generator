import { useEffect, type RefObject } from 'react'

/**
 * Réserve, en pixels, la bande que l'attribution occupe en bas de la carte.
 *
 * C'est la distance entre le bas de la carte et le **haut** du bandeau
 * d'attribution : sa hauteur propre, plus tout ce qui le pousse vers le
 * haut — la barre d'onglets et la poignée de la feuille sur téléphone.
 * Un seul nombre, qui n'a pas à connaître ces paliers.
 *
 * Rien de tout cela n'est constant : mesuré sur l'application,
 * l'attribution occupe 64 px sur un téléphone de 390 px (trois lignes),
 * 44 px entre 800 et 1280 (deux lignes), 24 px à partir de 1600 (une
 * seule), et davantage en gros texte (issue #173).
 *
 * L'attribution est exigée par l'ODbL et la Licence Ouverte : rien ne se
 * pose dessus. Les surimpressions ancrées en bas lisent donc cette valeur
 * au lieu de deviner (AUDIT_UX.md, constat U4).
 *
 * La première version n'exposait que la hauteur du bandeau. Elle suffisait
 * au bouton « Ma position » et pas au guide de premier lancement, qui se
 * pose au milieu du cadre et dont le bas retombait dessus — trouvé à la
 * revue, en regardant l'application plutôt que le diff.
 *
 * Posée sur la racine et non sur le conteneur de la carte : le bouton
 * « Ma position » est un **frère** de la carte, pas un descendant, et une
 * propriété personnalisée ne remonte pas. Posée sur le conteneur, elle ne
 * l'atteignait pas — et le bouton restait sur l'attribution sans que rien
 * ne le dise. C'est déjà là que vivent `data-mode` et `data-maquette`.
 */
export function useBandeAttribution(
  containerRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
): void {
  useEffect(() => {
    const conteneur = containerRef.current
    if (!conteneur) return
    const bandeau = conteneur.querySelector('.maplibregl-ctrl-bottom-right')
    if (!bandeau || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const mesurer = () => {
      const basDeLaCarte = conteneur.getBoundingClientRect().bottom
      const hautDuBandeau = bandeau.getBoundingClientRect().top
      racine.style.setProperty(
        '--bande-attribution',
        `${String(Math.max(0, Math.ceil(basDeLaCarte - hautDuBandeau)))}px`,
      )
    }
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(bandeau)
    observateur.observe(conteneur)
    /*
      Le bandeau se **déplace** aussi sans changer de taille : les règles
      d'`App.module.css` le relèvent selon la feuille, la fiche et la
      maquette. `ResizeObserver` n'en voit rien — la bande gardait la
      valeur de la feuille à mi-hauteur (450 px à 390 × 844) une fois la
      fiche ouverte, et « Ma position » se posait 14 px sur le crédit
      (#609). Ce sont ces attributs-ci que les règles lisent.
    */
    const deplacements = new MutationObserver(mesurer)
    deplacements.observe(document.documentElement, {
      subtree: true,
      attributeFilter: ['data-position', 'data-fiche', 'data-maquette'],
    })
    return () => {
      observateur.disconnect()
      deplacements.disconnect()
      racine.style.removeProperty('--bande-attribution')
    }
  }, [containerRef, ready])
}
