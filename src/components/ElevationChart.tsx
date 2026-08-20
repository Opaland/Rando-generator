import { useRef, useState } from 'react'
import { fillElevationGaps, pointAtDistance } from '../core/elevation.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm } from '../lib/format.ts'
import type { ElevationProfile } from '../core/types.ts'
import styles from './ElevationChart.module.css'

const WIDTH = 320
const HEIGHT = 90
const PADDING = 4

/** Pas de déplacement au clavier : 2 % du tracé par flèche. */
const PAS_CLAVIER = 0.02

/**
 * Petit graphique altimétrique SVG — pas de dépendance de graphique externe.
 *
 * Il est *lié à la carte* : parcourir une bosse y pose un marqueur. Un profil
 * altimétrique seul dit qu'il y a 300 m de montée, jamais où — et « où »
 * est précisément ce qu'on cherche quand on prépare une sortie. Le clavier
 * fait la même chose que la souris : les flèches déplacent le curseur.
 */
export function ElevationChart({ profile }: { profile: ElevationProfile }) {
  const setElevationHover = useAppStore((s) => s.setElevationHover)
  const [ratio, setRatio] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

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

  const survole =
    ratio === null ? null : pointAtDistance(profile, ratio * totalDistance)

  const deplacer = (nouveau: number | null) => {
    const borne = nouveau === null ? null : Math.min(Math.max(nouveau, 0), 1)
    setRatio(borne)
    setElevationHover(
      borne === null ? null : pointAtDistance(profile, borne * totalDistance),
    )
  }

  const surPointeur = (event: React.PointerEvent<SVGSVGElement>) => {
    const boite = svgRef.current?.getBoundingClientRect()
    if (!boite || boite.width === 0) return
    deplacer((event.clientX - boite.left) / boite.width)
  }

  const surClavier = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const depart = ratio ?? 0
    if (event.key === 'ArrowRight') deplacer(depart + PAS_CLAVIER)
    else if (event.key === 'ArrowLeft') deplacer(depart - PAS_CLAVIER)
    else if (event.key === 'Home') deplacer(0)
    else if (event.key === 'End') deplacer(1)
    // Échap est laissé à la fiche détail, qui se ferme avec : le curseur
    // s'efface de toute façon dès que le graphique perd le focus.
    else return
    event.preventDefault()
  }

  const curseurX =
    survole === null
      ? 0
      : PADDING +
        (survole.distanceMeters / totalDistance) * (WIDTH - 2 * PADDING)
  const curseurY =
    survole === null || survole.elevation === null
      ? HEIGHT / 2
      : HEIGHT -
        PADDING -
        ((survole.elevation - min) / span) * (HEIGHT - 2 * PADDING)

  return (
    <div className={styles.wrapper}>
      <svg
        ref={svgRef}
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        tabIndex={0}
        data-testid="elevation-chart"
        aria-label={`Profil altimétrique, de ${Math.round(min)} à ${Math.round(max)} mètres d'altitude. Flèches gauche et droite pour parcourir le tracé.`}
        preserveAspectRatio="none"
        onPointerMove={surPointeur}
        onPointerDown={surPointeur}
        onPointerLeave={() => {
          deplacer(null)
        }}
        onBlur={() => {
          deplacer(null)
        }}
        onKeyDown={surClavier}
      >
        <path className={styles.area} d={areaPath} />
        <path className={styles.line} d={linePath} />
        {survole && (
          <g className={styles.cursor}>
            <line x1={curseurX} y1={0} x2={curseurX} y2={HEIGHT} />
            <circle cx={curseurX} cy={curseurY} r={3.5} />
          </g>
        )}
      </svg>
      <p
        className={styles.readout}
        data-testid="elevation-readout"
        role="status"
      >
        {survole
          ? `${formatKm(survole.distanceMeters)} · ${
              survole.elevation === null
                ? 'altitude inconnue'
                : `${Math.round(survole.elevation)} m`
            }`
          : 'Parcourez le profil pour situer un passage sur la carte.'}
      </p>
    </div>
  )
}
