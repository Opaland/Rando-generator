import { useEffect, useState } from 'react'
import { sonderLeFond, type Couverture } from '../core/couvertureDuFond.ts'

/**
 * Le plan IGN couvre-t-il ce tracé ? Une tuile témoin le dit (#593) — la
 * Nouvelle-Calédonie rend 404 dès le zoom 8. « inconnu » tant que la sonde
 * n'a pas répondu, et pour toute panne : on ne retire rien sur un doute.
 *
 * `no-store` : l'IGN sert ses 404 avec `max-age` de 21 jours (mesuré le
 * 27/10) ; un « absent » mis en cache survivrait à une extension du plan.
 * Le témoin est une chaîne, comparée par valeur : la fiche passe un tableau
 * de coordonnées neuf à chaque rendu, et un tableau relançait la sonde.
 */
export function useCouvertureDuFond(temoin: string | null): Couverture {
  const [fond, setFond] = useState<Couverture>('inconnu')
  useEffect(() => {
    let vivant = true
    void sonderLeFond(temoin, (url) => fetch(url, { cache: 'no-store' })).then((verdict) => {
      if (vivant) setFond(verdict)
    })
    return () => {
      vivant = false
    }
  }, [temoin])
  return fond
}
