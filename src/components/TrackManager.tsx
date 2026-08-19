import { useRef, useState, type DragEvent } from 'react'
import { polylineLengthMeters } from '../core/sampling.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm } from '../lib/format.ts'
import styles from './TrackManager.module.css'

export function TrackManager() {
  const tracks = useAppStore((s) => s.tracks)
  const importErrors = useAppStore((s) => s.importErrors)
  const importGpxFiles = useAppStore((s) => s.importGpxFiles)
  const removeTrack = useAppStore((s) => s.removeTrack)
  const clearImportErrors = useAppStore((s) => s.clearImportErrors)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.gpx'),
    )
    if (files.length > 0) void importGpxFiles(files)
  }

  return (
    <section className={styles.section} aria-labelledby="tracks-title">
      <h2 id="tracks-title" className={styles.title}>
        Mes traces GPX
      </h2>

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
            className={styles.browse}
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
              void importGpxFiles(Array.from(files))
            }
            event.target.value = ''
          }}
        />
      </div>

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
              <button
                type="button"
                className={styles.delete}
                aria-label={`Supprimer la trace ${track.filename}`}
                onClick={() => void removeTrack(track.id)}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
