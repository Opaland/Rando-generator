import { useEffect, useRef } from 'react'

/** La marque de l'entrée d'historique que pose une fiche ouverte. */
const ENTREE = 'sentiers-fiche'

/**
 * Le bouton Retour ferme la fiche (#568, point 3).
 *
 * Sur téléphone, Retour avec une fiche ouverte quittait l'application. Tranché
 * par Cédric le 20/10 : comme dans une application, Retour ferme la fiche, et
 * Suivant ne la rouvre pas.
 *
 * Une entrée d'historique est posée à l'ouverture, et `popstate` ferme la
 * fiche. Fermée autrement — la croix, Échap —, l'entrée est **rendue**
 * (`history.back()`) : sans cela, le Retour suivant « fermerait » une fiche
 * qui n'est plus là, et il en faudrait deux pour partir. Passer d'une fiche à
 * une autre ne pose pas de nouvelle entrée : un seul Retour referme.
 */
export function useRetourFermeLaFiche(
  ouverte: number | null,
  fermer: () => void,
): void {
  const entreePosee = useRef(false)
  const fermeeParRetour = useRef(false)

  useEffect(() => {
    if (ouverte !== null && !entreePosee.current) {
      history.pushState({ [ENTREE]: true }, '')
      entreePosee.current = true
      return
    }
    if (ouverte === null && entreePosee.current) {
      entreePosee.current = false
      // Fermée par Retour : l'entrée est déjà consommée. Fermée autrement :
      // on la rend, pour que l'historique revienne là où il était.
      if (fermeeParRetour.current) fermeeParRetour.current = false
      else history.back()
    }
  }, [ouverte])

  useEffect(() => {
    const surRetour = () => {
      if (!entreePosee.current) return
      fermeeParRetour.current = true
      fermer()
    }
    window.addEventListener('popstate', surRetour)
    return () => {
      window.removeEventListener('popstate', surRetour)
    }
  }, [fermer])
}
