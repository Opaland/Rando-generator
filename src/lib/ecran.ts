import { useEffect, useState } from 'react'

/**
 * Le point de rupture entre la feuille glissante et le panneau colonne.
 *
 * Il vivait uniquement dans les feuilles de style, ce qui suffisait tant que
 * seul le CSS avait besoin de le connaître. Depuis que la navigation par
 * onglets décide *quelles sections sont rendues* (issue #171), React doit le
 * connaître aussi : masquer la barre en CSS sans le dire au composant
 * laissait, sur grand écran, un seul onglet affiché et aucun moyen d'en
 * changer. Le défaut n'a pas été trouvé en relisant — il a fait s'enliser la
 * suite e2e entière.
 *
 * Une seule valeur, ici, et les médias-requêtes qui la reprennent portent un
 * commentaire renvoyant à ce fichier.
 */
export const LARGEUR_COMPACTE_MAX = 800

/**
 * Vrai sur les écrans étroits — téléphones, et fenêtres réduites.
 *
 * L'état initial lit `matchMedia` plutôt que de supposer : un rendu qui
 * commencerait par « large » puis corrigerait ferait clignoter la
 * disposition à chaque ouverture.
 */
export function useEcranCompact(): boolean {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${String(LARGEUR_COMPACTE_MAX)}px)`)
        .matches,
  )

  useEffect(() => {
    const requete = window.matchMedia(
      `(max-width: ${String(LARGEUR_COMPACTE_MAX)}px)`,
    )
    const suivre = (evenement: MediaQueryListEvent) => {
      setCompact(evenement.matches)
    }
    requete.addEventListener('change', suivre)
    return () => {
      requete.removeEventListener('change', suivre)
    }
  }, [])

  return compact
}
