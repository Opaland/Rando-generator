import { useEffect, useRef, useState } from 'react'

interface Course {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/**
 * Reste-t-il du contenu sous le cadre visible ? Issue #585.
 *
 * La marge d'un pixel absorbe le `scrollTop` sous-pixel d'un zoom
 * fractionnaire, qui s'arrête à 619,5 pour une course de 620 : choix de
 * présentation (§2), pas mesure.
 */
export function resteADefiler({ scrollTop, clientHeight, scrollHeight }: Course): boolean {
  return scrollHeight - clientHeight - scrollTop > 1
}

/**
 * Suit `resteADefiler` sur un élément qui défile : au défilement, et quand
 * sa taille ou celle de son contenu change (gros texte, largeur, panneau
 * qui s'ouvre).
 */
export function useResteADefiler<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [reste, setReste] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const relire = () => {
      setReste(resteADefiler(el))
    }
    relire()
    el.addEventListener('scroll', relire, { passive: true })
    const observateur = new ResizeObserver(relire)
    observateur.observe(el)
    for (const enfant of Array.from(el.children)) observateur.observe(enfant)
    return () => {
      el.removeEventListener('scroll', relire)
      observateur.disconnect()
    }
  }, [])

  return { ref, reste }
}
