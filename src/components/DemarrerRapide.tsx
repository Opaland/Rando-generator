import { useAppStore } from '../store/appStore.ts'
import styles from './DemarrerRapide.module.css'

/**
 * Raccourci « démarrer une sortie » posé sur la carte (sprint 3, audit UI).
 *
 * Démarrer vivait uniquement sous l'onglet « Sorties », replié dans la
 * feuille : sur téléphone, partir marcher depuis « Carte » demandait de
 * changer d'onglet puis de déplier le panneau pour trouver le bouton.
 * Celui-ci fait les deux en un geste.
 *
 * N'existe que tant qu'aucune sortie n'est en cours (`App.tsx` le masque
 * sinon) : une fois démarrée, le témoin de la barre d'onglets et l'écran
 * d'enregistrement portent déjà cette information, et dupliquer le bouton
 * « Démarrer » déjà présent sous « Sorties » n'ajouterait rien.
 */
export function DemarrerRapide({ onDemarrer }: { onDemarrer: () => void }) {
  const demarrerSortie = useAppStore((s) => s.demarrerSortie)

  return (
    <button
      type="button"
      className={`btn-primary ${styles.bouton}`}
      data-testid="demarrer-rapide"
      onClick={() => {
        demarrerSortie()
        onDemarrer()
      }}
    >
      <span aria-hidden="true">▶</span>
      <span>Démarrer une sortie</span>
    </button>
  )
}
