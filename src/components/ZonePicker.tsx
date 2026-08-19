import { useEffect, useState, type FormEvent } from 'react'
import { ZONES } from '../core/overpass.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './ZonePicker.module.css'

const STAGE_TEXT: Record<'requesting' | 'retrying' | 'processing', string> = {
  requesting:
    'Interrogation d’OpenStreetMap… comptez 30 secondes à 2 minutes selon la charge des serveurs.',
  retrying:
    'Premier serveur injoignable, nouvelle tentative sur un second serveur…',
  processing: 'Réponse reçue, traitement des tracés…',
}

export function ZonePicker() {
  const zoneKey = useAppStore((s) => s.zoneKey)
  const zoneLabel = useAppStore((s) => s.zoneLabel)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
  const zoneLoadStage = useAppStore((s) => s.zoneLoadStage)
  const zoneError = useAppStore((s) => s.zoneError)
  const zoneFetchedAt = useAppStore((s) => s.zoneFetchedAt)
  const itineraries = useAppStore((s) => s.itineraries)
  const loadZone = useAppStore((s) => s.loadZone)
  const loadRef = useAppStore((s) => s.loadRef)
  const cancelZoneLoad = useAppStore((s) => s.cancelZoneLoad)
  const [refInput, setRefInput] = useState('')
  const [elapsedS, setElapsedS] = useState(0)

  useEffect(() => {
    if (!zoneLoading) return
    const start = Date.now()
    const tick = () => {
      setElapsedS(Math.round((Date.now() - start) / 1000))
    }
    // Affiche 0 s immédiatement plutôt que d'attendre le premier tick.
    tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [zoneLoading])

  const onRefSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (refInput.trim()) void loadRef(refInput)
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="zone-title" className={styles.title}>
          Zone
        </h2>
      </summary>
      <div className={styles.zones} role="group" aria-label="Zones prédéfinies">
        {ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zoneKey === zone.id ? styles.zoneActive : styles.zone}
            aria-pressed={zoneKey === zone.id}
            data-testid={`zone-${zone.id}`}
            disabled={zoneLoading}
            onClick={() => void loadZone(zone.id)}
          >
            {zone.label}
          </button>
        ))}
      </div>

      <form className={styles.refForm} onSubmit={onRefSubmit}>
        <label className={styles.refLabel} htmlFor="ref-input">
          Ou par ref d’itinéraire
        </label>
        <div className={styles.refRow}>
          <input
            id="ref-input"
            data-testid="ref-input"
            type="text"
            placeholder="ex. GR 20"
            value={refInput}
            disabled={zoneLoading}
            onChange={(e) => {
              setRefInput(e.target.value)
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            data-testid="ref-submit"
            disabled={zoneLoading || !refInput.trim()}
          >
            Charger
          </button>
        </div>
      </form>

      {zoneLoading && (
        <div className={styles.waiting} role="status" data-testid="zone-loading">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.waitingText}>
            {STAGE_TEXT[zoneLoadStage ?? 'requesting']}
            {elapsedS > 0 && (
              <span className={styles.elapsed} data-testid="zone-loading-elapsed">
                {' '}
                ({elapsedS} s)
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn-link"
            data-testid="zone-cancel"
            onClick={cancelZoneLoad}
          >
            Annuler
          </button>
        </div>
      )}

      {zoneError && (
        <p className={styles.error} role="alert" data-testid="zone-error">
          {zoneError}
        </p>
      )}

      {!zoneLoading && zoneKey && (
        <p className={styles.meta} data-testid="zone-meta">
          {itineraries.length} itinéraire{itineraries.length > 1 ? 's' : ''}
          {zoneFetchedAt &&
            ` · tracés du ${new Date(zoneFetchedAt).toLocaleDateString('fr-FR')}`}
          <button
            type="button"
            className="btn-link"
            data-testid="zone-refresh"
            onClick={() => {
              if (zoneKey.startsWith('ref:')) {
                if (zoneLabel) void loadRef(zoneLabel, { force: true })
              } else {
                void loadZone(zoneKey, { force: true })
              }
            }}
          >
            Actualiser les tracés
          </button>
        </p>
      )}
    </details>
  )
}
