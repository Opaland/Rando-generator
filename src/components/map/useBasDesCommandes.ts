import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Le bas des commandes du coin haut-droit de la carte (zoom, boussole),
 * mesuré depuis le haut de la carte et publié en `--bas-des-commandes`.
 *
 * Sous le point de rupture, « Démarrer » et « Ma position » se posent
 * juste dessous (LocateButton.module.css). Ils l'étaient à `top: 224px`,
 * une constante : 82 px de vide sous un zoom qui finit à 142 px, et c'est
 * ce vide qui poussait « Ma position » sous le crédit de la carte, et en
 * gros texte sous la feuille à mi-course (#556, mesuré le 21/10). La hauteur
 * du zoom change avec le pointeur (29 ou 44 px par bouton) : un nombre figé
 * serait faux quelque part, comme pour `--bande-attribution`.
 */
export function useBasDesCommandes(
  containerRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
): void {
  useEffect(() => {
    const conteneur = containerRef.current
    if (!conteneur) return
    const coin = conteneur.querySelector('.maplibregl-ctrl-top-right')
    if (!coin || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const mesurer = () => {
      const haut = conteneur.getBoundingClientRect().top
      const bas = coin.getBoundingClientRect().bottom
      racine.style.setProperty(
        '--bas-des-commandes',
        `${String(Math.max(0, Math.ceil(bas - haut)))}px`,
      )
    }
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(coin)
    return () => {
      observateur.disconnect()
      racine.style.removeProperty('--bas-des-commandes')
    }
  }, [containerRef, ready])
}
