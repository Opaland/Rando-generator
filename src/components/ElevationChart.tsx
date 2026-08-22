import { useRef, useState } from 'react'
import { fillElevationGaps, pointAtDistance } from '../core/elevation.ts'
import { reperesDuProfil } from '../core/reperes.ts'
import {
  couvertureRevetement,
  familleRevetement,
  libelleRevetement,
  type Bande,
} from '../core/revetement.ts'
import {
  deplacer as deplacerFenetre,
  estZoome,
  fenetreEntiere,
  zoomer,
  type Fenetre,
} from '../core/zoomProfil.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm } from '../lib/format.ts'
import type { ElevationProfile } from '../core/types.ts'
import styles from './ElevationChart.module.css'

const WIDTH = 320
const HEIGHT = 100
const PADDING = 4
/** Bande de revêtement, sous la courbe (issue #179). */
const HAUTEUR_BANDE = 9
const BAS_PROFIL = HEIGHT - HAUTEUR_BANDE - 3

/** Pas de déplacement au clavier : 2 % de la fenêtre visible par flèche. */
const PAS_CLAVIER = 0.02

/**
 * Petit graphique altimétrique SVG — pas de dépendance de graphique externe.
 *
 * Il est *lié à la carte* : parcourir une bosse y pose un marqueur. Un profil
 * altimétrique seul dit qu'il y a 300 m de montée, jamais où — et « où »
 * est précisément ce qu'on cherche quand on prépare une sortie. Le clavier
 * fait la même chose que la souris : les flèches déplacent le curseur.
 *
 * Il porte aussi le **revêtement** (issue #179), en bande sous la courbe.
 * C'est la réponse à ce que la mesure a montré : le revêtement n'est
 * renseigné que sur un tiers de la longueur, par tronçons épars. Un filtre
 * « praticable » trancherait sur ce tiers en laissant croire qu'il tranche
 * sur tout ; la bande, elle, montre *où* c'est connu et où ça ne l'est pas.
 */
export function ElevationChart({
  profile,
  bandes = [],
}: {
  profile: ElevationProfile
  bandes?: Bande[]
}) {
  const setElevationHover = useAppStore((s) => s.setElevationHover)
  const pois = useAppStore((s) => s.pois)
  const [curseur, setCurseur] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const elevations = fillElevationGaps(profile.elevations)
  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const span = Math.max(max - min, 1) // évite une division par 0 (profil plat)
  const totalDistance = profile.distances[profile.distances.length - 1] || 1

  // `null` vaut « tout le parcours ». Aucune resynchronisation n'est
  // nécessaire quand l'itinéraire change : le parent remonte le composant
  // par sa `key`, ce que React recommande pour remettre un état à zéro sur
  // changement de props — un effet qui appellerait setState provoquerait un
  // rendu en cascade pour le même résultat.
  const [fenetreChoisie, setFenetreChoisie] = useState<Fenetre | null>(null)
  const fenetre = fenetreChoisie ?? fenetreEntiere(totalDistance)
  const largeurVisible = Math.max(fenetre.fin - fenetre.debut, 1)
  const zoome = estZoome(fenetre, totalDistance)

  const xDe = (distance: number) =>
    PADDING +
    ((distance - fenetre.debut) / largeurVisible) * (WIDTH - 2 * PADDING)

  // Cols, sommets et refuges traversés : un profil de montagne sans nom de
  // col est une courbe sans repère — on voit qu'on monte de 900 mètres, on
  // ne sait pas vers quoi.
  const reperes = reperesDuProfil(profile, pois)

  const points = profile.distances.map((d, i) => {
    const elevation = elevations[i] ?? min
    const y =
      BAS_PROFIL - ((elevation - min) / span) * (BAS_PROFIL - 2 * PADDING)
    return [xDe(d), y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const areaPath =
    `${linePath} L${(points[points.length - 1]?.[0] ?? WIDTH).toFixed(1)},${BAS_PROFIL} ` +
    `L${(points[0]?.[0] ?? 0).toFixed(1)},${BAS_PROFIL} Z`

  const survole = curseur === null ? null : pointAtDistance(profile, curseur)
  const couverture = couvertureRevetement(bandes)

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
    const borne =
      nouveau === null ? null : Math.min(Math.max(nouveau, 0), totalDistance)
    setCurseur(borne)
    setElevationHover(borne === null ? null : pointAtDistance(profile, borne))
  }

  const distanceSousPointeur = (clientX: number): number | null => {
    const boite = svgRef.current?.getBoundingClientRect()
    if (!boite || boite.width === 0) return null
    const part = (clientX - boite.left) / boite.width
    return fenetre.debut + part * largeurVisible
  }

  const surPointeur = (event: React.PointerEvent<SVGSVGElement>) => {
    const distance = distanceSousPointeur(event.clientX)
    if (distance === null) return
    if (event.type === 'pointerdown') setEpingle(true)
    deplacer(distance)
  }

  const surClavier = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const depart = curseur ?? fenetre.debut
    const pas = largeurVisible * PAS_CLAVIER
    setEpingle(true)
    if (event.key === 'ArrowRight') deplacer(depart + pas)
    else if (event.key === 'ArrowLeft') deplacer(depart - pas)
    else if (event.key === 'Home') deplacer(0)
    else if (event.key === 'End') deplacer(totalDistance)
    // Échap est laissé à la fiche détail, qui se ferme avec : le curseur
    // s'efface de toute façon dès que le graphique perd le focus.
    else return
    event.preventDefault()
  }

  /** Le zoom se centre sur le curseur s'il y en a un, sinon sur le milieu. */
  const centreDuZoom = () => curseur ?? fenetre.debut + largeurVisible / 2

  const curseurX = survole === null ? 0 : xDe(survole.distanceMeters)
  const curseurY =
    survole === null || survole.elevation === null
      ? BAS_PROFIL / 2
      : BAS_PROFIL -
        ((survole.elevation - min) / span) * (BAS_PROFIL - 2 * PADDING)

  const bandeSurvolee =
    curseur === null
      ? null
      : (bandes.find((b) => curseur >= b.debut && curseur <= b.fin) ?? null)

  return (
    <div className={styles.wrapper}>
      <svg
        ref={svgRef}
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        tabIndex={0}
        data-testid="elevation-chart"
        aria-label={`Profil altimétrique, de ${Math.round(min)} à ${Math.round(max)} mètres d'altitude.${
          bandes.length > 0
            ? ` Revêtement renseigné sur ${Math.round(couverture.fraction * 100)} % du parcours.`
            : ''
        } Flèches gauche et droite pour parcourir le tracé.`}
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
        <defs>
          {/* L'inconnu est hachuré, non coloré : une couleur pleine se lit
              comme une valeur, et deux tiers du parcours n'en ont pas. */}
          <pattern
            id="revetement-inconnu"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" className={styles.hachure} />
          </pattern>
          <clipPath id="cadre-profil">
            <rect x={PADDING} y="0" width={WIDTH - 2 * PADDING} height={HEIGHT} />
          </clipPath>
        </defs>
        <g clipPath="url(#cadre-profil)">
          <path className={styles.area} d={areaPath} />
          <path className={styles.line} d={linePath} />
          {bandes.map((bande) => {
            const x = xDe(bande.debut)
            const largeur = xDe(bande.fin) - x
            const famille = familleRevetement(bande.surface)
            return (
              <rect
                key={`${String(bande.debut)}-${bande.surface ?? 'nc'}`}
                x={x}
                y={HEIGHT - HAUTEUR_BANDE}
                width={Math.max(largeur, 0.5)}
                height={HAUTEUR_BANDE}
                className={styles.bande}
                data-famille={famille}
                fill={
                  famille === 'inconnu' ? 'url(#revetement-inconnu)' : undefined
                }
              />
            )
          })}
          {reperes.map((repere) => {
            const x = xDe(repere.distanceMeters)
            return (
              <g key={repere.id} className={styles.repere}>
                <line x1={x} y1={PADDING} x2={x} y2={BAS_PROFIL} />
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
        </g>
      </svg>

      <div className={styles.zoom} data-testid="profil-zoom">
        <button
          type="button"
          data-testid="zoom-avant"
          aria-label="Zoomer sur le profil"
          onClick={() => {
            setFenetreChoisie(
              zoomer(fenetre, totalDistance, 0.5, centreDuZoom()),
            )
          }}
        >
          +
        </button>
        <button
          type="button"
          data-testid="zoom-arriere"
          aria-label="Dézoomer le profil"
          disabled={!zoome}
          onClick={() => {
            setFenetreChoisie(zoomer(fenetre, totalDistance, 2, centreDuZoom()))
          }}
        >
          −
        </button>
        <button
          type="button"
          data-testid="zoom-gauche"
          aria-label="Reculer sur le tracé"
          disabled={!zoome || fenetre.debut <= 0}
          onClick={() => {
            setFenetreChoisie(deplacerFenetre(fenetre, totalDistance, -0.5))
          }}
        >
          ◀
        </button>
        <button
          type="button"
          data-testid="zoom-droite"
          aria-label="Avancer sur le tracé"
          disabled={!zoome || fenetre.fin >= totalDistance}
          onClick={() => {
            setFenetreChoisie(deplacerFenetre(fenetre, totalDistance, 0.5))
          }}
        >
          ▶
        </button>
        <button
          type="button"
          data-testid="zoom-tout"
          disabled={!zoome}
          onClick={() => {
            setFenetreChoisie(null)
          }}
        >
          Tout voir
        </button>
        {zoome && (
          <span className={styles.etendue} data-testid="profil-etendue">
            {formatKm(fenetre.debut)} – {formatKm(fenetre.fin)}
          </span>
        )}
      </div>

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
            }${bandeSurvolee ? ` · ${libelleRevetement(bandeSurvolee.surface)}` : ''}`
          : 'Parcourez le profil pour situer un passage sur la carte.'}
      </p>

      {bandes.length > 0 && (
        <p className={styles.couverture} data-testid="revetement-couverture">
          Revêtement renseigné dans OpenStreetMap sur{' '}
          <strong>{Math.round(couverture.fraction * 100)} %</strong> du
          parcours. Le reste n’est pas inconnu du terrain — il est absent de
          la carte.
        </p>
      )}

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
