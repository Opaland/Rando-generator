import { fillElevationGaps } from '../core/elevation.ts'
import type { ElevationProfile } from '../core/types.ts'
import styles from './ElevationChart.module.css'

const WIDTH = 320
const HEIGHT = 90
const PADDING = 4

/** Petit graphique altimétrique SVG — pas de dépendance de graphique externe. */
export function ElevationChart({ profile }: { profile: ElevationProfile }) {
  const elevations = fillElevationGaps(profile.elevations)
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const span = Math.max(max - min, 1) // évite une division par 0 (profil plat)
  const totalDistance = profile.distances[profile.distances.length - 1] || 1

  const points = profile.distances.map((d, i) => {
    const x = PADDING + (d / totalDistance) * (WIDTH - 2 * PADDING)
    const elevation = elevations[i] ?? min
    const y =
      HEIGHT -
      PADDING -
      ((elevation - min) / span) * (HEIGHT - 2 * PADDING)
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const areaPath =
    `${linePath} L${(points[points.length - 1]?.[0] ?? WIDTH).toFixed(1)},${HEIGHT} ` +
    `L${(points[0]?.[0] ?? 0).toFixed(1)},${HEIGHT} Z`

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Profil altimétrique, de ${Math.round(min)} à ${Math.round(max)} mètres d'altitude`}
      preserveAspectRatio="none"
    >
      <path className={styles.area} d={areaPath} />
      <path className={styles.line} d={linePath} />
    </svg>
  )
}
