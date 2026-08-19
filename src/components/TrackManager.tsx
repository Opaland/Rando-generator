import { useEffect, useRef, useState, type DragEvent } from 'react'
import { polylineLengthMeters } from '../core/sampling.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm } from '../lib/format.ts'
import { ConfirmDeleteButton } from './ConfirmDeleteButton.tsx'
import styles from './TrackManager.module.css'

const SUCCESS_TIMEOUT_MS = 4000

export function TrackManager() {
  const tracks = useAppStore((s) => s.tracks)
  const importErrors = useAppStore((s) => s.importErrors)
  const importGpxFiles = useAppStore((s) => s.importGpxFiles)
  const removeTrack = useAppStore((s) => s.removeTrack)
  const clearImportErrors = useAppStore((s) => s.clearImportErrors)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    },
    [],
  )

  const runImport = async (files: File[]) => {
    setImporting(true)
    setSuccessMsg(null)
    const errorsBefore = useAppStore.getState().importErrors.length
    await importGpxFiles(files)
    setImporting(false)
    const newErrors = useAppStore.getState().importErrors.length - errorsBefore
    const imported = files.length - newErrors
    if (imported > 0) {
      setSuccessMsg(
        imported === 1 ? '1 trace importée.' : `${imported} traces importées.`,
      )
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => {
        setSuccessMsg(null)
      }, SUCCESS_TIMEOUT_MS)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.gpx'),
    )
    if (files.length > 0) void runImport(files)
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="tracks-title" className={styles.title}>
          Mes traces GPX
        </h2>
      </summary>

      <div
        className={dragOver ? styles.dropzoneActive : styles.dropzone}
        data-testid="gpx-dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => {
          setDragOver(false)
        }}
        onDrop={onDrop}
      >
        <p className={styles.dropText}>
          Glissez vos fichiers GPX ici, ou
          <button
            type="button"
            className="btn-link"
            data-testid="gpx-browse"
            onClick={() => inputRef.current?.click()}
          >
            parcourez vos fichiers
          </button>
        </p>
        <p className={styles.dropHint}>
          Lecture 100 % locale : vos traces ne sont envoyées nulle part.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,application/gpx+xml"
          multiple
          hidden
          data-testid="gpx-input"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) {
              void runImport(Array.from(files))
            }
            event.target.value = ''
          }}
        />
      </div>

      {importing && (
        <p className={styles.importing} role="status" data-testid="gpx-importing">
          Import en cours…
        </p>
      )}

      {successMsg && (
        <p
          className={styles.success}
          role="status"
          aria-live="polite"
          data-testid="gpx-import-success"
        >
          {successMsg}
        </p>
      )}

      {importErrors.length > 0 && (
        <div className={styles.errors} role="alert" data-testid="gpx-errors">
          <ul>
            {importErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <button type="button" onClick={clearImportErrors}>
            OK
          </button>
        </div>
      )}

      {tracks.length === 0 ? (
        <p className={styles.empty} data-testid="tracks-empty">
          Aucune trace pour l’instant.
        </p>
      ) : (
        <ul className={styles.list} data-testid="tracks-list">
          {tracks.map((track) => (
            <li key={track.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.filename}>{track.filename}</span>
                <span className={styles.itemMeta}>
                  {track.date
                    ? new Date(track.date).toLocaleDateString('fr-FR')
                    : 'date inconnue'}
                  {' · '}
                  {formatKm(polylineLengthMeters(track.points))}
                  {typeof track.elevationGain === 'number' &&
                    ` · D+ ${Math.round(track.elevationGain)} m`}
                </span>
              </div>
              <ConfirmDeleteButton
                label={`Supprimer la trace ${track.filename}`}
                onConfirm={() => void removeTrack(track.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
