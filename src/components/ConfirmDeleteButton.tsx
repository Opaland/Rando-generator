import { useEffect, useRef, useState } from 'react'
import { prolongeUnDoubleClic } from '../lib/doubleClic.ts'
import styles from './ConfirmDeleteButton.module.css'

const CONFIRM_TIMEOUT_MS = 4000

interface Props {
  /** Libellé accessible complet, ex. « Supprimer la trace sortie.gpx ». */
  label: string
  onConfirm: () => void
  testId?: string
  /** Texte visible du premier temps ; « Supprimer » par défaut. */
  texte?: string
}

export function ConfirmDeleteButton({
  label,
  onConfirm,
  testId,
  texte = 'Supprimer',
}: Props) {
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
        onClick={(event) => {
          if (prolongeUnDoubleClic(event)) return
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
      onClick={(event) => {
        if (prolongeUnDoubleClic(event)) return
        setConfirming(true)
        timer.current = setTimeout(() => {
          setConfirming(false)
        }, CONFIRM_TIMEOUT_MS)
      }}
    >
      {texte}
    </button>
  )
}
