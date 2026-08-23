import { useAppStore } from '../store/appStore.ts'
import { libellePoignee } from '../core/poignee.ts'
import { chiffresDeLaSortie, sortieOuverte } from '../core/sortieEnCours.ts'
import { useHorloge } from '../lib/useHorloge.ts'

/**
 * Le texte de la poignée de la feuille.
 *
 * Composant à part et non une expression dans `App` : pendant une sortie,
 * ce texte se rafraîchit chaque seconde, et faire battre l'application
 * entière au même rythme serait payer très cher une ligne de deux mots.
 */
export function PoigneeTexte({ pourcentage }: { pourcentage: number | null }) {
  const enregistrement = useAppStore((s) => s.enregistrement)
  const enSortie = sortieOuverte(enregistrement)
  const maintenant = useHorloge(enSortie)

  return (
    <>
      {libellePoignee({
        sortie: enSortie
          ? chiffresDeLaSortie(enregistrement, maintenant)
          : null,
        pourcentage,
      })}
    </>
  )
}
