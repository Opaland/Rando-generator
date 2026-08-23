import { useEffect, useState } from 'react'

/** Un battement par seconde : ce qu'il faut pour qu'un chronomètre avance. */
const BATTEMENT_MS = 1000

/**
 * L'heure courante, rafraîchie chaque seconde tant que `actif` est vrai.
 *
 * Les chiffres d'une sortie avancent avec l'horloge, pas avec les
 * positions : entre deux relevés il peut s'écouler dix secondes, et un
 * compteur figé pendant dix secondes ressemble à une application plantée.
 *
 * Nommé une fois plutôt que recopié : deux surfaces affichent maintenant la
 * durée d'une sortie en cours — l'écran de marche et la poignée de la
 * feuille — et deux minuteries écrites à la main auraient dérivé
 * (CLAUDE.md §4).
 */
export function useHorloge(actif: boolean): number {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    if (!actif) return
    // Pas de relevé immédiat ici : l'état part déjà de « maintenant », et
    // rafraîchir dans le corps de l'effet est un effet de bord au montage
    // que React n'aime pas — à raison. Le premier battement arrive une
    // seconde plus tard, ce qui ne se voit pas sur un chronomètre.
    const battement = setInterval(() => {
      setMaintenant(Date.now())
    }, BATTEMENT_MS)
    return () => {
      clearInterval(battement)
    }
  }, [actif])
  return maintenant
}
