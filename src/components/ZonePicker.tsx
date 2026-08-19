import { useState, type FormEvent } from 'react'
import { ZONES } from '../core/overpass.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './ZonePicker.module.css'

export function ZonePicker() {
  const zoneKey = useAppStore((s) => s.zoneKey)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
  const zoneError = useAppStore((s) => s.zoneError)
  const zoneFetchedAt = useAppStore((s) => s.zoneFetchedAt)
  const itineraries = useAppStore((s) => s.itineraries)
  const loadZone = useAppStore((s) => s.loadZone)
  const loadRef = useAppStore((s) => s.loadRef)
  const [refInput, setRefInput] = useState('')

  const onRefSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (refInput.trim()) void loadRef(refInput)
  }

  return (
    <section className={styles.section} aria-labelledby="zone-title">
      <h2 id="zone-title" className={styles.title}>
        Zone
      </h2>
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
            data-testid="ref-submit"
            disabled={zoneLoading || !refInput.trim()}
          >
            Charger
          </button>
        </div>
      </form>

      {zoneLoading && (
        <p className={styles.waiting} role="status" data-testid="zone-loading">
          Interrogation d’OpenStreetMap… comptez 30 secondes à 2 minutes selon
          la charge des serveurs. Merci de patienter.
        </p>
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
            className={styles.refresh}
            data-testid="zone-refresh"
            onClick={() => {
              if (zoneKey.startsWith('ref:')) return
              void loadZone(zoneKey, { force: true })
            }}
            hidden={zoneKey.startsWith('ref:')}
          >
            Actualiser les tracés
          </button>
        </p>
      )}
    </section>
  )
}
