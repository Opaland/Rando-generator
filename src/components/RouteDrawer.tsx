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
  const allerRetourTrace = useAppStore((s) => s.allerRetourTrace)
  const bouclerTrace = useAppStore((s) => s.bouclerTrace)
  const estimerDeniveleTrace = useAppStore((s) => s.estimerDeniveleTrace)
  const drawGainMeters = useAppStore((s) => s.drawGainMeters)
  const drawGainLoading = useAppStore((s) => s.drawGainLoading)
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
        Posez des étapes sur la carte : le tracé suit les chemins affichés
        entre elles.
      </p>

      <p className={styles.stats} data-testid="route-drawer-stats">
        {drawWaypoints.length} étape{drawWaypoints.length > 1 ? 's' : ''}
        {canSave && ` · ${formatKm(meters)}`}
        {drawGainMeters !== null && ` · D+ ${drawGainMeters} m`}
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
        {/*
          Les deux formes de sortie les plus courantes depuis un parking
          (issue #137). Les recliquer à l'envers point par point est un
          travail que la machine fait mieux.
        */}
        <button
          type="button"
          className="btn-secondary"
          data-testid="route-drawer-aller-retour"
          disabled={drawWaypoints.length < 2}
          title="Revenir au départ par le même chemin"
          onClick={allerRetourTrace}
        >
          Aller-retour
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="route-drawer-boucler"
          disabled={drawWaypoints.length < 3}
          title="Rentrer au départ par les chemins"
          onClick={bouclerTrace}
        >
          Fermer la boucle
        </button>
        {/*
          Le dénivelé se demande, il ne se calcule pas à chaque clic : un
          tracé de vingt étapes ferait vingt requêtes pour un chiffre qui
          n'intéresse qu'à la fin.
        */}
        <button
          type="button"
          className="btn-secondary"
          data-testid="route-drawer-denivele"
          disabled={!canSave || drawGainLoading}
          onClick={() => void estimerDeniveleTrace()}
        >
          {drawGainLoading ? 'Mesure du relief…' : 'Estimer le D+'}
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
