import { useEffect, useRef, useState } from 'react'
import { COMPLETION_CHOICES } from '../core/milestones.ts'
import {
  NIVEAUX_TOLERANCE,
  niveauDesMetres,
  type NiveauTolerance,
} from '../core/tolerance.ts'
import { MIN_TOLERANCE, MAX_TOLERANCE, useAppStore } from '../store/appStore.ts'
import styles from './Settings.module.css'

/** Réglage de la tolérance de matching (25–100 m) avec recalcul. */
export function Settings() {
  const toleranceMeters = useAppStore((s) => s.toleranceMeters)
  const setTolerance = useAppStore((s) => s.setTolerance)
  const completionPct = useAppStore((s) => s.completionPct)
  const setCompletionPct = useAppStore((s) => s.setCompletionPct)
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
  const niveauActuel: NiveauTolerance | null = niveauDesMetres(shown)

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
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>
          Quand compter un sentier comme parcouru
        </legend>
        <div className={styles.niveaux} data-testid="tolerance-niveaux">
          {NIVEAUX_TOLERANCE.map((niveau) => (
            <label key={niveau.id} className={styles.niveau}>
              <input
                type="radio"
                name="tolerance"
                value={niveau.id}
                checked={niveauActuel === niveau.id}
                data-testid={`tolerance-${niveau.id}`}
                onChange={() => {
                  onChange(niveau.metres)
                }}
              />
              <span>
                <span className={styles.niveauNom}>{niveau.libelle}</span>
                <span className={styles.niveauTexte}>
                  {niveau.explication}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* La valeur en mètres reste consultable pour qui la veut, en second
          rideau — et c'est le seul endroit qui dit la vérité quand une
          sauvegarde ancienne porte une valeur intermédiaire. */}
      <details className={styles.detail}>
        <summary className={styles.detailTitre} data-testid="tolerance-detail">
          {niveauActuel === null
            ? `Réglage personnalisé : ${String(shown)} m`
            : `La distance exacte : ${String(shown)} m`}
        </summary>
        <p className={styles.hint}>
          Un tronçon est compté « parcouru » si votre trace passe à moins de
          cette distance. Un passage isolé, ou une trace qui reste toujours à
          distance sans jamais serrer le sentier (une route qui le longe, par
          exemple), n’est jamais compté.
        </p>
        <div className={styles.row}>
          <input
            type="range"
            min={MIN_TOLERANCE}
            max={MAX_TOLERANCE}
            step={5}
            value={shown}
            data-testid="tolerance-slider"
            aria-label="Distance exacte, en mètres"
            onChange={(e) => {
              onChange(Number(e.target.value))
            }}
          />
          <output className={styles.value} data-testid="tolerance-value">
            {shown} m
          </output>
        </div>
      </details>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Seuil « bouclé »</legend>
        <div className={styles.choices} data-testid="completion-choices">
          {COMPLETION_CHOICES.map((seuil) => (
            <label key={seuil} className={styles.choice}>
              <input
                type="radio"
                name="completion"
                value={seuil}
                checked={completionPct === seuil}
                data-testid={`completion-${seuil}`}
                onChange={() => {
                  void setCompletionPct(seuil)
                }}
              />
              {seuil} %
            </label>
          ))}
        </div>
        <p className={styles.hint}>
          À partir de quelle part parcourue un itinéraire est annoncé comme
          bouclé. 95 % par défaut : exiger 100 % vous punirait pour un tronçon
          impraticable, une déviation de balisage ou une géométrie
          OpenStreetMap imparfaite — rien de tout cela ne dépend de vous. 100 %
          si vous voulez le compte exact. Le seuil retenu est affiché partout
          où le mot « bouclé » apparaît.
        </p>
      </fieldset>
    </details>
  )
}
