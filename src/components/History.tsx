import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import {
  historyStats,
  monthLabel,
  monthlyBuckets,
} from '../core/history.ts'
import { formatKm } from '../lib/format.ts'
import styles from './History.module.css'

/** Un an de recul : au-delà, les barres deviennent illisibles. */
const MAX_MOIS = 12

const CHART_HEIGHT = 70

/**
 * « Mes sorties » : ce que le tableau de bord ne montre pas — le rythme.
 * Les traces portaient déjà une date, elle n'était affichée nulle part.
 */
export function History() {
  const tracks = useAppStore((s) => s.tracks)

  const { stats, buckets } = useMemo(
    () => ({
      stats: historyStats(tracks),
      buckets: monthlyBuckets(tracks).slice(-MAX_MOIS),
    }),
    [tracks],
  )

  if (stats.count === 0) return null

  const maxDistance = Math.max(...buckets.map((b) => b.distanceMeters), 1)
  const resume = buckets
    .filter((b) => b.count > 0)
    .map((b) => `${monthLabel(b.month)} : ${formatKm(b.distanceMeters)}`)
    .join(' ; ')

  return (
    <details className={styles.section} data-testid="history" open>
      <summary className="acc-summary">
        <h2 className={styles.title}>Mes sorties</h2>
      </summary>

      <p className={styles.totals} data-testid="history-totals">
        <strong>
          {stats.count} sortie{stats.count > 1 ? 's' : ''}
        </strong>{' '}
        · {formatKm(stats.distanceMeters)}
        {stats.elevationGain > 0 &&
          ` · ${Math.round(stats.elevationGain).toLocaleString('fr-FR')} m D+`}
      </p>

      {buckets.length > 0 && (
        <div className={styles.chart} data-testid="history-chart">
          <svg
            viewBox={`0 0 ${buckets.length * 10} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className={styles.svg}
            role="img"
            aria-label={`Distance par mois — ${resume || 'aucune sortie datée'}`}
          >
            {buckets.map((bucket, index) => {
              const hauteur =
                (bucket.distanceMeters / maxDistance) * (CHART_HEIGHT - 4)
              return (
                <rect
                  key={bucket.month}
                  x={index * 10 + 1.5}
                  y={CHART_HEIGHT - hauteur}
                  width={7}
                  height={Math.max(hauteur, bucket.count > 0 ? 2 : 0)}
                  className={styles.bar}
                />
              )
            })}
          </svg>
          <p className={styles.axis}>
            <span>{monthLabel((buckets[0] as { month: string }).month)}</span>
            {buckets.length > 1 && (
              <span>
                {monthLabel(
                  (buckets[buckets.length - 1] as { month: string }).month,
                )}
              </span>
            )}
          </p>
        </div>
      )}

      {stats.undatedCount > 0 && (
        <p className={styles.hint}>
          {stats.undatedCount} trace{stats.undatedCount > 1 ? 's' : ''} sans
          date : comptée{stats.undatedCount > 1 ? 's' : ''} dans les totaux,
          absente{stats.undatedCount > 1 ? 's' : ''} du graphique.
        </p>
      )}
    </details>
  )
}
