import { useRef, useState } from 'react'
import {
  fillElevationGaps,
  libelleResolution,
  pointAtDistance,
  tronconsContinus,
} from '../core/elevation.ts'
import type { Interruption } from '../core/mapdata.ts'
import { reperesDuProfil } from '../core/reperes.ts'
import {
  couvertureRevetement,
  libelleRevetement,
  type Bande,
} from '../core/revetement.ts'
import {
  deplacer as deplacerFenetre,
  estZoome,
  fenetreEntiere,
  suivre,
  zoomer,
  type Fenetre,
} from '../core/zoomProfil.ts'
import { useAppStore } from '../store/appStore.ts'
import { formatKm } from '../lib/format.ts'
import type { ElevationProfile } from '../core/types.ts'
import styles from './ElevationChart.module.css'

/** Un pourcentage entier, sans division par zéro. */
function pourcent(part: number, total: number): string {
  return `${String(Math.round((part / Math.max(total, 1)) * 100))} %`
}

/**
 * Ce qu'on écrit sous le curseur pour un tronçon.
 *
 * Une déduction ne se présente jamais comme un relevé : « probablement
 * goudronné » et « bitume » ne disent pas la même chose à quelqu'un qui
 * décide de s'engager en fauteuil.
 */
function texteBande(bande: Bande): string {
  if (bande.origine === 'renseigne') return libelleRevetement(bande.surface)
  if (bande.origine === 'inconnu') return 'revêtement non renseigné'
  return bande.famille === 'dur'
    ? 'probablement goudronné (voie carrossable)'
    : 'probablement non revêtu (chemin)'
}

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
  interruptions = [],
}: {
  profile: ElevationProfile
  bandes?: Bande[]
  /**
   * Les segments de l'axe qui ne sont pas du chemin (issue #323). La courbe
   * s'y interrompt : un trait tiré d'un bord à l'autre décrit un terrain
   * réel, mais pas celui qu'on marchera.
   */
  interruptions?: Interruption[]
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

  /*
    Les altitudes comblées, retrouvables par distance : `tronconsContinus`
    rend des sous-profils dont les indices ne sont plus ceux d'origine, et
    reprendre `elevations[i]` dessus lirait l'altitude d'un autre point.
  */
  const elevationsParDistance = new Map(
    profile.distances.map((d, i) => [d, elevations[i] ?? min]),
  )

  /*
    La courbe se dessine morceau par morceau (issue #323).

    Sur une relation trouée, deux points consécutifs du profil peuvent se
    trouver de part et d'autre d'un saut de plusieurs centaines de mètres. Le
    trait qui les relie décrit un terrain réel — celui qui est sous la ligne
    droite — mais pas celui qu'on marchera. Un blanc dit la vérité ; un trait
    la déguise, et rien ne le distingue d'une montée.

    Le découpage est celui de `tronconsContinus`, le même que celui du D+ et
    de la pente : les trois doivent couper aux mêmes endroits.
  */
  const morceaux = tronconsContinus(profile, interruptions).map((troncon) =>
    troncon.distances.map((d, i) => {
      const elevation = elevationsParDistance.get(d) ?? min
      const y =
        BAS_PROFIL - ((elevation - min) / span) * (BAS_PROFIL - 2 * PADDING)
      return [xDe(d), y, i] as const
    }),
  )
  const linePath = morceaux
    .map((morceau) =>
      morceau
        .map(
          ([x, y], i) =>
            `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`,
        )
        .join(' '),
    )
    .filter((chemin) => chemin.length > 0)
    .join(' ')
  const areaPath = morceaux
    .filter((morceau) => morceau.length > 0)
    .map((morceau) => {
      const premier = morceau[0]
      const dernier = morceau[morceau.length - 1]
      if (!premier || !dernier) return ''
      const trait = morceau
        .map(
          ([x, y], i) =>
            `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`,
        )
        .join(' ')
      return (
        `${trait} L${dernier[0].toFixed(1)},${BAS_PROFIL} ` +
        `L${premier[0].toFixed(1)},${BAS_PROFIL} Z`
      )
    })
    .join(' ')

  const survole = curseur === null ? null : pointAtDistance(profile, curseur)
  const couverture = couvertureRevetement(bandes)
  /**
   * Retour du 22/08 sur la Via Lugdunum : « km 21.4, l'altitude de 714 m ne
   * correspond pas à l'altitude du point ». Elle ne le pouvait pas — sur
   * 200 km, le profil ne porte qu'un relevé tous les deux kilomètres, et ce
   * qui s'affiche entre deux relevés est la valeur d'une droite. Le chiffre
   * n'était pas faux par erreur de calcul : il était présenté comme une
   * mesure alors qu'il est une interpolation. `null` quand les relevés sont
   * serrés — une mise en garde affichée partout ne se lit plus nulle part.
   */
  const resolution = libelleResolution(profile)

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
    // La fenêtre suit le curseur. Le curseur est borné au parcours entier,
    // pas à la fenêtre visible — `End` doit mener au bout du tracé, pas au
    // bout de ce qu'on regarde. Sans cela, une seule frappe sur une fenêtre
    // zoomée sortait le curseur du cadre : il était écrêté et invisible
    // pendant que la lecture et le marqueur de carte continuaient d'avancer
    // (revue du sprint 6).
    if (borne !== null && fenetreChoisie !== null) {
      setFenetreChoisie(suivre(fenetreChoisie, totalDistance, borne))
    }
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
            ? ` Revêtement renseigné sur ${Math.round(couverture.fraction * 100)} % du parcours, déduit du type de voie sur ${Math.round((couverture.deduitMetres / Math.max(couverture.totalMetres, 1)) * 100)} %.`
            : ''
        }${resolution === null ? '' : ` ${resolution}`} Flèches gauche et droite pour parcourir le tracé.`}
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
            return (
              <rect
                key={`${String(bande.debut)}-${bande.famille}-${bande.origine}`}
                x={x}
                y={HEIGHT - HAUTEUR_BANDE}
                width={Math.max(largeur, 0.5)}
                height={HAUTEUR_BANDE}
                className={styles.bande}
                data-famille={bande.famille}
                data-origine={bande.origine}
                fill={
                  bande.origine === 'inconnu'
                    ? 'url(#revetement-inconnu)'
                    : undefined
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
            }${bandeSurvolee ? ` · ${texteBande(bandeSurvolee)}` : ''}`
          : 'Parcourez le profil pour situer un passage sur la carte.'}
      </p>

      {resolution !== null && (
        <p className={styles.resolution} data-testid="profil-resolution">
          {resolution}
        </p>
      )}

      {bandes.length > 0 && (
        <div className={styles.couverture} data-testid="revetement-couverture">
          <ul className={styles.legende}>
            <li data-origine="renseigne">
              <span className={styles.pastille} data-origine="renseigne" />
              Relevé dans OpenStreetMap :{' '}
              <strong>{pourcent(couverture.connuMetres, couverture.totalMetres)}</strong>
            </li>
            <li data-origine="deduit">
              <span className={styles.pastille} data-origine="deduit" />
              Déduit du type de voie :{' '}
              <strong>{pourcent(couverture.deduitMetres, couverture.totalMetres)}</strong>
            </li>
            <li data-origine="inconnu">
              <span className={styles.pastille} data-origine="inconnu" />
              Rien à en dire :{' '}
              <strong>{pourcent(couverture.inconnuMetres, couverture.totalMetres)}</strong>
            </li>
          </ul>
          <p className={styles.note}>
            Les portions <em>déduites</em> le sont du type de voie, pas d’un
            relevé de terrain : une route est goudronnée dans 93 à 100 % des
            cas où OpenStreetMap le précise, un chemin ou un sentier ne l’est
            que dans 7 à 24 %. Mesuré sur 1 086 km d’itinéraires du Pilat.
          </p>
        </div>
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
