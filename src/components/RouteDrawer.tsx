import { useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { polylineLengthMeters } from '../core/sampling.ts'
import { formatKm } from '../lib/format.ts'
import styles from './RouteDrawer.module.css'

/**
 * Panneau du mode « tracer un itinéraire » : chaque clic sur la carte pose
 * une étape accrochée au sentier le plus proche, et le tracé suit les chemins
 * affichés entre les étapes (plus court chemin, cf. core/routing.ts).
 */
export function RouteDrawer() {
  const drawMode = useAppStore((s) => s.drawMode)
  const drawPath = useAppStore((s) => s.drawPath)
  const drawWaypoints = useAppStore((s) => s.drawWaypoints)
  const drawError = useAppStore((s) => s.drawError)
  const toggleDrawMode = useAppStore((s) => s.toggleDrawMode)
  const undoDrawPoint = useAppStore((s) => s.undoDrawPoint)
  const saveDrawnItinerary = useAppStore((s) => s.saveDrawnItinerary)
  const [name, setName] = useState('')

  if (!drawMode) return null

  const meters = polylineLengthMeters(drawPath)
  const canSave = drawPath.length >= 2

  return (
    <aside
      className={styles.panel}
      aria-label="Tracer un itinéraire"
      data-testid="route-drawer"
    >
      <header className={styles.header}>
        <h3 className={styles.title}>Tracer un itinéraire</h3>
        <button
          type="button"
          className="btn-icon-close"
          aria-label="Quitter le mode tracé"
          data-testid="route-drawer-close"
          onClick={toggleDrawMode}
        >
          ×
        </button>
      </header>

      <p className={styles.hint}>
        Cliquez sur la carte pour poser des étapes : le tracé suit les chemins
        affichés entre elles.
      </p>

      <p className={styles.stats} data-testid="route-drawer-stats">
        {drawWaypoints.length} étape{drawWaypoints.length > 1 ? 's' : ''}
        {canSave && ` · ${formatKm(meters)}`}
      </p>

      {drawError && (
        <p className={styles.error} role="alert" data-testid="route-drawer-error">
          {drawError}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn-secondary"
          data-testid="route-drawer-undo"
          disabled={drawWaypoints.length === 0}
          onClick={undoDrawPoint}
        >
          Annuler la dernière étape
        </button>
      </div>

      <label className={styles.nameLabel} htmlFor="route-name">
        Nom de l’itinéraire
      </label>
      <div className={styles.saveRow}>
        <input
          id="route-name"
          type="text"
          className={styles.nameInput}
          placeholder="ex. Boucle du Crêt"
          data-testid="route-drawer-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
        />
        <button
          type="button"
          className="btn-primary"
          data-testid="route-drawer-save"
          disabled={!canSave}
          onClick={() => {
            void saveDrawnItinerary(name).then(() => {
              setName('')
            })
          }}
        >
          Enregistrer
        </button>
      </div>
      <p className={styles.note}>
        L’itinéraire est ajouté à « Mes itinéraires » et sa progression est
        calculée comme pour un GR.
      </p>
    </aside>
  )
}
