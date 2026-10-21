import { useEffect } from 'react'
import type { RefObject } from 'react'

/*
  Sous le point de rupture, choisir un itinéraire ou ouvrir le tracé
  replie le crédit en « ⓘ » (#553, 21/10) — ce que MapLibre fait déjà au
  premier glisser (`_updateCompactMinimize`), et pour la même raison : le
  crédit a été lu au chargement, et c'est maintenant à l'utilisateur.

  Le crédit passe au-dessus de toute surimpression depuis le 20/10. Déplié,
  il fait 104 px de haut à 390 × 844 (mesuré) et peignait sur « Voir la
  fiche » de la carte d'itinéraire, à 390 comme à 800 : la fiche ne
  pouvait plus s'ouvrir. Le « ⓘ » reste au-dessus de tout, et le rouvre.
*/
export function useCreditReplie(
  containerRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
  panneauOuvert: boolean,
): void {
  useEffect(() => {
    if (!ready || !panneauOuvert) return
    if (!window.matchMedia('(max-width: 800px)').matches) return
    containerRef.current
      ?.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')
      ?.classList.remove('maplibregl-compact-show')
  }, [containerRef, ready, panneauOuvert])
}
