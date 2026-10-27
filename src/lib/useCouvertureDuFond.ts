import { useEffect, useState } from 'react'
import { sonderLeFond, type Couverture } from '../core/couvertureDuFond.ts'

/**
 * Le plan IGN couvre-t-il ces tuiles ? Une tuile témoin le dit (#593) — la
 * Nouvelle-Calédonie rend 404 dès le zoom 8. « inconnu » tant que la sonde
 * n'a pas répondu, et pour toute panne : on ne retire rien sur un doute.
 */
export function useCouvertureDuFond(tuiles: readonly string[]): Couverture {
  const [fond, setFond] = useState<Couverture>('inconnu')
  useEffect(() => {
    let vivant = true
    void sonderLeFond(tuiles, (url) => fetch(url)).then((verdict) => {
      if (vivant) setFond(verdict)
    })
    return () => {
      vivant = false
    }
  }, [tuiles])
  return fond
}
