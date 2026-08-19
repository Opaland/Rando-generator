import { useEffect, useRef, useState } from 'react'
import styles from './ConfirmDeleteButton.module.css'

const CONFIRM_TIMEOUT_MS = 4000

interface Props {
  /** Libellé accessible complet, ex. « Supprimer la trace sortie.gpx ». */
  label: string
  onConfirm: () => void
  testId?: string
}

/**
 * Bouton de suppression à deux temps : un premier clic bascule sur
 * « Confirmer ? » (annulé automatiquement après quelques secondes), le
 * second déclenche réellement la suppression. Évite les pertes de données
 * accidentelles sans passer par une boîte de dialogue native.
 */
export function ConfirmDeleteButton({ label, onConfirm, testId }: Props) {
  const [confirming, setConfirming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  if (confirming) {
    return (
      <button
        type="button"
        className={styles.confirm}
        aria-label={`Confirmer : ${label}`}
        data-testid={testId ? `${testId}-confirm` : undefined}
        onClick={() => {
          if (timer.current) clearTimeout(timer.current)
          setConfirming(false)
          onConfirm()
        }}
      >
        Confirmer ?
      </button>
    )
  }

  return (
    <button
      type="button"
      className={styles.delete}
      aria-label={label}
      data-testid={testId}
      onClick={() => {
        setConfirming(true)
        timer.current = setTimeout(() => {
          setConfirming(false)
        }, CONFIRM_TIMEOUT_MS)
      }}
    >
      Supprimer
    </button>
  )
}
