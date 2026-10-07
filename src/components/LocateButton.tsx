import type { ReactNode } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { formatAccuracy, isAccuracyPoor } from '../core/geolocation.ts'
import styles from './LocateButton.module.css'

/**
 * Bouton « où suis-je » : affiche la position de l'appareil sur la carte.
 * La position est lue via l'API du navigateur et reste dans l'onglet — elle
 * n'est ni enregistrée, ni envoyée nulle part.
 *
 * `avant` empile un élément de plus dans la même colonne de contrôles, pour
 * qu'il profite de l'évitement de la fiche et de l'attribution déjà posé
 * ici plutôt que de le recopier (CLAUDE.md §4) — ce que `DemarrerRapide`
 * (sprint 3) fait depuis `App.tsx`.
 */
export function LocateButton({ avant = null }: { avant?: ReactNode } = {}) {
  const geoWatching = useAppStore((s) => s.geoWatching)
  const userPosition = useAppStore((s) => s.userPosition)
  const geoError = useAppStore((s) => s.geoError)
  const toggleGeolocation = useAppStore((s) => s.toggleGeolocation)

  return (
    <div className={styles.wrapper}>
      {avant}
      {geoError && (
        <p className={styles.error} role="alert" data-testid="geo-error">
          {geoError}
        </p>
      )}
      {geoWatching && userPosition && (
        <p
          className={
            isAccuracyPoor(userPosition.accuracy) ? styles.poor : styles.accuracy
          }
          data-testid="geo-accuracy"
        >
          {formatAccuracy(userPosition.accuracy)}
          {isAccuracyPoor(userPosition.accuracy) && ' — position imprécise'}
        </p>
      )}
      <button
        type="button"
        className={geoWatching ? styles.buttonActive : styles.button}
        aria-pressed={geoWatching}
        data-testid="locate-toggle"
        title={
          geoWatching
            ? 'Arrêter le suivi de ma position'
            : 'Afficher ma position sur la carte'
        }
        onClick={toggleGeolocation}
      >
        <span aria-hidden="true">◎</span>
        <span className={styles.label}>
          {geoWatching ? 'Suivi actif' : 'Ma position'}
        </span>
      </button>
    </div>
  )
}
