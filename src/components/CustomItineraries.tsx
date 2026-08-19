import { useMemo, useRef } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { formatKm, formatPct } from '../lib/format.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './CustomItineraries.module.css'

/**
 * Itinéraires créés par l'utilisateur : un GPX importé comme parcours *à
 * suivre* (et non comme trace parcourue). Complétion calculée à part.
 */
export function CustomItineraries() {
  const customItineraries = useAppStore((s) => s.customItineraries)
  const customMatching = useAppStore((s) => s.customMatching)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const importCustomGpx = useAppStore((s) => s.importCustomGpx)
  const removeCustomItinerary = useAppStore((s) => s.removeCustomItinerary)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const resultById = useMemo(
    () =>
      new Map((customMatching?.results ?? []).map((r) => [r.itineraryId, r])),
    [customMatching],
  )

  return (
    <section className={styles.section} aria-labelledby="custom-title">
      <h2 id="custom-title" className={styles.title}>
        Mes itinéraires
      </h2>
      <p className={styles.hint}>
        Importez le GPX d’un parcours <strong>à faire</strong> (cartoguide,
        Visorando, tracé maison…) et suivez votre progression dessus. Rien ne
        quitte votre navigateur.
      </p>
      <button
        type="button"
        className={styles.add}
        data-testid="custom-browse"
        onClick={() => inputRef.current?.click()}
      >
        Ajouter un itinéraire (GPX)
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        multiple
        hidden
        data-testid="custom-input"
        onChange={(event) => {
          const files = event.target.files
          if (files && files.length > 0) {
            void importCustomGpx(Array.from(files))
          }
          event.target.value = ''
        }}
      />

      {customItineraries.length > 0 && (
        <ul className={styles.list} data-testid="custom-list">
          {customItineraries.map((itin) => {
            const result = resultById.get(itin.osmRelationId)
            const pct = result?.pct ?? 0
            const selected = selectedItineraryId === itin.osmRelationId
            const name = itin.name ?? 'Itinéraire perso'
            return (
              <li key={itin.osmRelationId} className={styles.item}>
                <button
                  type="button"
                  className={selected ? styles.rowSelected : styles.row}
                  aria-pressed={selected}
                  onClick={() => {
                    selectItinerary(selected ? null : itin.osmRelationId)
                  }}
                >
                  <span className={styles.name}>{name}</span>
                  <ProgressBalise
                    pct={pct}
                    network="PERSO"
                    label={`Progression ${name}`}
                  />
                  <span className={styles.stats}>
                    <span className={styles.pct}>{formatPct(pct)}</span>
                    <span className={styles.km}>{formatKm(itin.totalMeters)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.delete}
                  aria-label={`Supprimer l’itinéraire ${name}`}
                  onClick={() => void removeCustomItinerary(itin.osmRelationId)}
                >
                  Supprimer
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
