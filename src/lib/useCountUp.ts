import { useEffect, useRef, useState } from 'react'
import { animatedValue } from '../core/animation.ts'

/** Même durée que la barre de progression (ProgressBalise.module.css). */
const COUNT_UP_MS = 300

/**
 * Fait rattraper au chiffre le mouvement de la barre qui l'accompagne.
 *
 * Respecte `prefers-reduced-motion` : qui a demandé moins d'animation reçoit
 * la valeur directement. Le premier affichage n'est jamais animé — un
 * compteur qui monte de 0 au chargement ferait passer une donnée persistée
 * pour un calcul en cours.
 */
export function useCountUp(value: number, duration = COUNT_UP_MS): number {
  const [affiche, setAffiche] = useState(value)
  const depart = useRef(value)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    // Qui a demandé moins d'animation reçoit la valeur d'un coup : une durée
    // nulle traverse le même chemin, sans branche parallèle à maintenir.
    const reduit =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    const duree = reduit ? 0 : duration

    const from = depart.current
    const debut = performance.now()
    const avancer = () => {
      const elapsed = performance.now() - debut
      const courant = animatedValue(from, value, elapsed, duree)
      setAffiche(courant)
      depart.current = courant
      if (elapsed < duree) frame.current = requestAnimationFrame(avancer)
    }
    frame.current = requestAnimationFrame(avancer)

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [value, duration])

  return affiche
}
