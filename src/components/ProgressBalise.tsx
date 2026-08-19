import type { Network } from '../core/types.ts'
import styles from './ProgressBalise.module.css'

const NETWORK_COLORS: Record<Network, string> = {
  GR: 'var(--rouge-balisage)',
  GRP: 'var(--orange-grp)',
  PR: 'var(--jaune-pr)',
  PERSO: 'var(--vert-noir)',
}

/**
 * Barre de progression stylisée « balise » : le remplissage reprend les deux
 * bandes du balisage (blanc + couleur du réseau).
 */
export function ProgressBalise({
  pct,
  network = 'GR',
  label,
}: {
  pct: number
  network?: Network
  label: string
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={styles.fill}
        style={{
          width: `${clamped}%`,
          ['--stripe-color' as string]: NETWORK_COLORS[network],
        }}
      />
    </div>
  )
}
