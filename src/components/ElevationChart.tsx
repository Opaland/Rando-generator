import { useRef, useState } from 'react'
import { fillElevationGaps, pointAtDistance } from '../core/elevation.ts'
import { reperesDuProfil } from '../core/reperes.ts'
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
  const pois = useAppStore((s) => s.pois)
  const [ratio, setRatio] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const elevations = fillElevationGaps(profile.elevations)
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const span = Math.max(max - min, 1) // évite une division par 0 (profil plat)
  const totalDistance = profile.distances[profile.distances.length - 1] || 1

  // Cols, sommets et refuges traversés : un profil de montagne sans nom de
  // col est une courbe sans repère — on voit qu'on monte de 900 mètres, on
  // ne sait pas vers quoi.
  const reperes = reperesDuProfil(profile, pois)

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

  /**
   * Un repère posé d'un clic reste posé.
   *
   * Sans cela, quitter le graphique l'effaçait — c'est-à-dire exactement le
   * geste qu'on fait juste après avoir cliqué : regarder la carte. On
   * cliquait, on tournait la tête, il n'y avait rien. Le survol, lui, reste
   * un survol : il prévisualise et s'efface en sortant.
   */
  const [epingle, setEpingle] = useState(false)

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
    if (event.type === 'pointerdown') setEpingle(true)
    deplacer((event.clientX - boite.left) / boite.width)
  }

  const surClavier = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const depart = ratio ?? 0
    setEpingle(true)
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
        onPointerLeave={(event) => {
          // Au doigt, le navigateur détruit le pointeur dès que le contact
          // cesse : un « pointerleave » suit immédiatement chaque tap. Et à
          // la souris, sortir du graphique est le geste qui suit le clic —
          // on va regarder la carte. Dans les deux cas, un repère posé
          // volontairement doit rester : c'est le tap ou le clic suivant, ou
          // la perte du focus, qui l'efface.
          if (event.pointerType === 'touch' || epingle) return
          deplacer(null)
        }}
        onBlur={() => {
          setEpingle(false)
          deplacer(null)
        }}
        onKeyDown={surClavier}
      >
        <path className={styles.area} d={areaPath} />
        <path className={styles.line} d={linePath} />
        {reperes.map((repere) => {
          const x =
            PADDING +
            (repere.distanceMeters / totalDistance) * (WIDTH - 2 * PADDING)
          return (
            <g key={repere.id} className={styles.repere}>
              <line x1={x} y1={PADDING} x2={x} y2={HEIGHT - PADDING} />
              <circle cx={x} cy={PADDING} r={2} />
            </g>
          )
        })}
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
      {reperes.length > 0 && (
        <ol className={styles.reperes} data-testid="elevation-reperes">
          {reperes.map((repere) => (
            <li key={repere.id}>
              <span className={styles.repereNom}>{repere.name}</span>
              <span className={styles.repereDetail}>
                {formatKm(repere.distanceMeters)}
                {repere.elevation !== null &&
                  ` · ${Math.round(repere.elevation).toLocaleString('fr-FR')} m`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
