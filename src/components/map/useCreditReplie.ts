import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const CREDIT_DEPLIE =
  '.maplibregl-ctrl-attrib.maplibregl-compact.maplibregl-compact-show'

/** Replie le crédit en « ⓘ », comme MapLibre au premier glisser. */
function replier(conteneur: HTMLElement | null): void {
  conteneur?.querySelector(CREDIT_DEPLIE)?.classList.remove('maplibregl-compact-show')
}

function chevauche(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/**
 * Les commandes de la carte que le crédit déplié peut recouvrir : « Ma
 * position » et le groupe du zoom et de la boussole.
 */
function recouvreUneCommande(credit: Element): boolean {
  const r = credit.getBoundingClientRect()
  const commandes = document.querySelectorAll(
    '[data-testid="locate-toggle"], .maplibregl-ctrl-top-right .maplibregl-ctrl-group',
  )
  return Array.from(commandes).some((c) => chevauche(r, c.getBoundingClientRect()))
}

/*
  Sous le point de rupture, choisir un itinéraire ou ouvrir le tracé
  replie le crédit en « ⓘ » (#553, 21/10) — ce que MapLibre fait déjà au
  premier glisser (`_updateCompactMinimize`), et pour la même raison : le
  crédit a été lu au chargement, et c'est maintenant à l'utilisateur.

  Le crédit passe au-dessus de toute surimpression depuis le 20/10. Déplié,
  il fait 104 px de haut à 390 × 844 (mesuré) et peignait sur « Voir la
  fiche » de la carte d'itinéraire, à 390 comme à 800 : la fiche ne
  pouvait plus s'ouvrir. Le « ⓘ » reste au-dessus de tout, et le rouvre.

  Même chose quand la mise en page change — la feuille bouge, le gros
  texte s'active — et que le crédit déplié se retrouve sur « Ma position »
  ou sur la boussole (#556) : en gros texte, feuille à mi-course, il reste
  307 px de carte pour un crédit d'environ 180 (mesuré le 21/10), et il n'y
  a pas d'endroit où il ne recouvre rien. Déclenché par ces changements-là
  seulement, jamais par le crédit lui-même : rouvert au « ⓘ », il resterait
  sinon impossible à lire.

  Et ce que cette règle a replié, elle le redéplie dès que la place revient
  — feuille repliée, gros texte retiré : le crédit est dû partout où il
  tient (`attribution.spec.ts`). L'essai se fait dans la même tâche, mesure
  comprise : rien n'est peint entre les deux. Ce que l'utilisateur, un
  glisser ou un panneau ont replié, elle n'y touche pas.
*/
export function useCreditReplie(
  containerRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
  panneauOuvert: boolean,
): void {
  const repliePourLaPlace = useRef(false)

  useEffect(() => {
    if (!ready || !panneauOuvert) return
    if (!window.matchMedia('(max-width: 800px)').matches) return
    repliePourLaPlace.current = false
    replier(containerRef.current)
  }, [containerRef, ready, panneauOuvert])

  useEffect(() => {
    if (!ready) return
    const verifier = () => {
      const credit = containerRef.current?.querySelector(
        '.maplibregl-ctrl-attrib.maplibregl-compact',
      )
      if (!credit) return
      const deplie = credit.classList.contains('maplibregl-compact-show')
      if (!deplie && !repliePourLaPlace.current) return
      credit.classList.add('maplibregl-compact-show')
      repliePourLaPlace.current = recouvreUneCommande(credit)
      if (repliePourLaPlace.current) {
        credit.classList.remove('maplibregl-compact-show')
      }
    }
    // Les règles qui relèvent le crédit (App.module.css) s'appliquent dès
    // que l'attribut change ; une image plus tard, la mise en page est faite.
    // Un geste sur la carte — le « ⓘ » compris — rend la main à l'utilisateur :
    // ce qu'il replie ensuite n'est plus à nous. Sans cela, rouvert puis
    // refermé au « ⓘ », le crédit se rouvrait au mouvement suivant de la
    // feuille (revue du sprint 1, 21/10, e2e vu rouge).
    const conteneur = containerRef.current
    const rendreLaMain = () => {
      repliePourLaPlace.current = false
    }
    conteneur?.addEventListener('pointerdown', rendreLaMain, true)
    const observateur = new MutationObserver(() => requestAnimationFrame(verifier))
    observateur.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-position', 'data-gros-texte'],
    })
    verifier()
    return () => {
      conteneur?.removeEventListener('pointerdown', rendreLaMain, true)
      observateur.disconnect()
    }
  }, [containerRef, ready])
}
