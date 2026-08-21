import { useEffect, useRef, useState, type DragEvent } from 'react'
import { polylineLengthMeters } from '../core/sampling.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm, importProgressLabel } from '../lib/format.ts'
import { outingLabel } from '../core/outing.ts'
import { ConfirmDeleteButton } from './ConfirmDeleteButton.tsx'
import styles from './TrackManager.module.css'

const SUCCESS_TIMEOUT_MS = 4000

export function TrackManager() {
  const tracks = useAppStore((s) => s.tracks)
  const importErrors = useAppStore((s) => s.importErrors)
  const importGpxFiles = useAppStore((s) => s.importGpxFiles)
  const importProgress = useAppStore((s) => s.importProgress)
  const outingDetail = useAppStore((s) => s.outingDetail)
  const toggleOutingDetail = useAppStore((s) => s.toggleOutingDetail)
  const removeTrack = useAppStore((s) => s.removeTrack)
  const clearImportErrors = useAppStore((s) => s.clearImportErrors)
  const importDoublons = useAppStore((s) => s.importDoublons)
  const importerDoublon = useAppStore((s) => s.importerDoublon)
  const ignorerDoublon = useAppStore((s) => s.ignorerDoublon)
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
    // Compter les traces ajoutées, et non les fichiers moins les erreurs :
    // une archive en contient plusieurs, un fichier peut être importé tout
    // en signalant quelque chose, et un doublon n'est plus une erreur.
    const avant = useAppStore.getState().tracks.length
    await importGpxFiles(files)
    setImporting(false)
    const imported = useAppStore.getState().tracks.length - avant
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
          Mes traces
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
          Glissez vos fichiers GPX, FIT ou TCX ici, ou
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
          Lecture 100 % locale : vos traces ne sont envoyées nulle part. Vous
          pouvez aussi déposer l’archive d’export de Strava ou Garmin, telle
          quelle : elle est ouverte ici, sur votre appareil.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.fit,.tcx,.zip,application/gpx+xml,application/vnd.ant.fit,application/zip"
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
          {importProgress
            ? importProgressLabel(importProgress)
            : 'Import en cours…'}
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

      {importDoublons.length > 0 && (
        <div className={styles.doublons} data-testid="gpx-doublons">
          <p>
            {importDoublons.length === 1
              ? 'Une trace ressemble à une sortie déjà importée.'
              : `${importDoublons.length} traces ressemblent à des sorties déjà importées.`}{' '}
            À vous de voir.
          </p>
          <ul>
            {importDoublons.map((doublon) => (
              <li key={doublon.id}>
                <span className={styles.doublonNom}>{doublon.filename}</span>
                <span>ressemble à « {doublon.ressembleA} »</span>
                <span className={styles.doublonActions}>
                  <button
                    type="button"
                    onClick={() => void importerDoublon(doublon.id)}
                  >
                    Importer quand même
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ignorerDoublon(doublon.id)
                    }}
                  >
                    Ignorer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tracks.length === 0 ? (
        <p className={styles.empty} data-testid="tracks-empty">
          Aucune trace pour l’instant.
        </p>
      ) : (
        <ul className={styles.list} data-testid="tracks-list">
          {tracks.map((track) => {
            const ouvert = outingDetail?.trackId === track.id
            return (
              <li key={track.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemInfo}
                  aria-expanded={ouvert}
                  data-testid={`track-toggle-${track.filename}`}
                  onClick={() => void toggleOutingDetail(track.id)}
                >
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
                </button>
                <ConfirmDeleteButton
                  label={`Supprimer la trace ${track.filename}`}
                  onConfirm={() => void removeTrack(track.id)}
                />
                {ouvert && (
                  <div className={styles.outing} data-testid="track-outing">
                    <p className={styles.outingTitle}>{outingLabel(track)}</p>
                    {outingDetail.loading ? (
                      <p className={styles.outingHint} role="status">
                        Calcul de la sortie…
                      </p>
                    ) : outingDetail.highlights.length === 0 ? (
                      <p className={styles.outingHint}>
                        Cette sortie n’a fait avancer aucun itinéraire balisé
                        de la zone chargée.
                      </p>
                    ) : (
                      <ul className={styles.outingList}>
                        {outingDetail.highlights.map((fait) => (
                          <li key={fait.itineraryId}>
                            <strong>{fait.name}</strong> :{' '}
                            {formatKm(fait.doneMeters)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}
