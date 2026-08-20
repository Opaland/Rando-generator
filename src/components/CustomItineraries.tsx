import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { formatKm, formatPct } from '../lib/format.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import { ConfirmDeleteButton } from './ConfirmDeleteButton.tsx'
import styles from './CustomItineraries.module.css'

const SUCCESS_TIMEOUT_MS = 4000

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
  const toggleDrawMode = useAppStore((s) => s.toggleDrawMode)
  // Tracer n'a de sens qu'avec un réseau affiché à suivre.
  const hasNetwork = useAppStore(
    (s) => s.itineraries.length > 0 || s.customItineraries.length > 0,
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    },
    [],
  )

  const resultById = useMemo(
    () =>
      new Map((customMatching?.results ?? []).map((r) => [r.itineraryId, r])),
    [customMatching],
  )

  const runImport = async (files: File[]) => {
    setImporting(true)
    setSuccessMsg(null)
    const errorsBefore = useAppStore.getState().importErrors.length
    await importCustomGpx(files)
    setImporting(false)
    const newErrors = useAppStore.getState().importErrors.length - errorsBefore
    const imported = files.length - newErrors
    if (imported > 0) {
      setSuccessMsg(
        imported === 1
          ? '1 itinéraire ajouté.'
          : `${imported} itinéraires ajoutés.`,
      )
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => {
        setSuccessMsg(null)
      }, SUCCESS_TIMEOUT_MS)
    }
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="custom-title" className={styles.title}>
          Mes itinéraires
        </h2>
      </summary>
      <p className={styles.hint}>
        Importez un parcours <strong>à faire</strong> (cartoguide, Visorando,
        tracé maison…) et suivez votre progression dessus. Rien ne quitte
        votre navigateur.
      </p>
      <p className={styles.hint}>
        GPX, FIT et TCX pour un parcours ; <strong>GeoJSON</strong> pour un jeu
        entier — le PDIPR d’un département, par exemple : téléchargez-le chez
        le producteur, déposez-le ici, chaque sentier devient un itinéraire à
        compléter.
      </p>
      <div className={styles.addRow}>
        <button
          type="button"
          className="btn-primary"
          data-testid="custom-browse"
          onClick={() => inputRef.current?.click()}
        >
          Ajouter un itinéraire
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="custom-draw"
          disabled={!hasNetwork}
          title={
            hasNetwork
              ? undefined
              : 'Chargez d’abord une zone : le tracé suit les chemins affichés.'
          }
          onClick={toggleDrawMode}
        >
          Tracer sur la carte
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.fit,.tcx,.geojson,.json,application/gpx+xml,application/geo+json"
        multiple
        hidden
        data-testid="custom-input"
        onChange={(event) => {
          const files = event.target.files
          if (files && files.length > 0) {
            void runImport(Array.from(files))
          }
          event.target.value = ''
        }}
      />

      {importing && (
        <p className={styles.importing} role="status" data-testid="custom-importing">
          Import en cours…
        </p>
      )}

      {successMsg && (
        <p
          className={styles.success}
          role="status"
          aria-live="polite"
          data-testid="custom-import-success"
        >
          {successMsg}
        </p>
      )}

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
                <ConfirmDeleteButton
                  label={`Supprimer l’itinéraire ${name}`}
                  onConfirm={() => void removeCustomItinerary(itin.osmRelationId)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}
