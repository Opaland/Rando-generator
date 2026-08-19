import { useEffect, useRef, useState } from 'react'
import { MIN_TOLERANCE, MAX_TOLERANCE, useAppStore } from '../store/appStore.ts'
import styles from './Settings.module.css'

/** Réglage de la tolérance de matching (25–100 m) avec recalcul. */
export function Settings() {
  const toleranceMeters = useAppStore((s) => s.toleranceMeters)
  const setTolerance = useAppStore((s) => s.setTolerance)
  const aDesDonnees = useAppStore(
    (s) => s.itineraries.length > 0 || s.tracks.length > 0,
  )
  // null = suivre l'état des données ; dès que l'utilisateur ouvre ou ferme
  // la section, c'est son choix qui prime. Régler la précision de suivi GPS
  // avant d'avoir la moindre trace n'a aucun sens : la section reste repliée.
  const [ouvert, setOuvert] = useState<boolean | null>(null)
  // Valeur en cours de réglage ; null = suivre la valeur du store.
  const [draft, setDraft] = useState<number | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    },
    [],
  )

  const shown = draft ?? toleranceMeters

  const onChange = (next: number) => {
    setDraft(next)
    if (commitTimer.current) clearTimeout(commitTimer.current)
    // Petit délai pour ne pas recalculer à chaque cran du curseur.
    commitTimer.current = setTimeout(() => {
      void setTolerance(next).then(() => {
        setDraft(null)
      })
    }, 250)
  }

  return (
    <details
      className={styles.section}
      data-testid="settings"
      open={ouvert ?? aDesDonnees}
      onToggle={(e) => {
        setOuvert(e.currentTarget.open)
      }}
    >
      <summary className="acc-summary">
        <h2 id="settings-title" className={styles.title}>
          Précision de suivi GPS
        </h2>
      </summary>
      <div className={styles.row}>
        <input
          type="range"
          min={MIN_TOLERANCE}
          max={MAX_TOLERANCE}
          step={5}
          value={shown}
          data-testid="tolerance-slider"
          aria-label="Précision de suivi GPS en mètres"
          onChange={(e) => {
            onChange(Number(e.target.value))
          }}
        />
        <output className={styles.value} data-testid="tolerance-value">
          {shown} m
        </output>
      </div>
      <p className={styles.hint}>
        Un tronçon est compté « parcouru » si votre trace passe à moins de
        cette distance — augmentez-la si votre GPS est imprécis, réduisez-la
        pour être plus exigeant. Un passage isolé, ou une trace qui reste
        toujours à distance sans jamais serrer le sentier (une route qui le
        longe, par exemple), n’est jamais compté.
      </p>
    </details>
  )
}
