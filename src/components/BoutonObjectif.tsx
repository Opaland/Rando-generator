import { useAppStore } from '../store/appStore.ts'
import styles from './BoutonObjectif.module.css'

/**
 * Épingler se décide en regardant l'itinéraire (issue #13) : sur sa carte et
 * sur sa fiche. Le panneau « Objectifs » ne fait que retirer ; au téléphone,
 * où la carte est réduite (#584), la fiche est le seul endroit où en ajouter.
 */
export function BoutonObjectif({
  itineraryId,
  testId,
}: {
  itineraryId: number
  testId: string
}) {
  const objectif = useAppStore((s) => s.objectifs.includes(itineraryId))
  const basculerObjectif = useAppStore((s) => s.basculerObjectif)
  return (
    <button
      type="button"
      className={objectif ? styles.objectifActif : styles.objectif}
      aria-pressed={objectif}
      data-testid={testId}
      onClick={() => void basculerObjectif(itineraryId)}
    >
      {objectif ? '★ Objectif suivi' : '☆ Suivre comme objectif'}
    </button>
  )
}
