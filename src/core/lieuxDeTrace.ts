import { ZONES } from './overpass.ts'
import type { LonLat } from './types.ts'

/**
 * Dans quelles zones prédéfinies une sortie a-t-elle été faite ? Issue #296.
 *
 * Karim exporte depuis Garmin : ses fichiers s'appellent
 * `activity_18274639.gpx`, et il tape « Pilat ». #206 indexe la zone chargée
 * **au moment de l'import** ; restaient les traces importées avant, ou hors
 * de toute zone. Tranché par Cédric le 22/10 : les contours des zones
 * prédéfinies, simplifiés à ~100 m (`scripts/contours-de-zone.mjs`).
 *
 * Écartés, et pourquoi (voir l'issue) :
 * - le géocodage inverse : il enverrait la position de chaque sortie à un
 *   tiers, ce que le produit refuse ;
 * - les contours communaux : 11,7 Mo gzippés pour rester justes, et
 *   « Pilat » n'est le nom d'aucune commune ;
 * - les emprises de #578 : des boîtes, qui se chevauchent — une trace
 *   « dans la boîte de l'Isère » peut être en Savoie.
 *
 * Ce module ne sert qu'à **chercher**, jamais à afficher un lieu : une
 * trace qui longe une limite à moins de ~100 m peut tomber du mauvais
 * côté. Retrouvée par un mot de trop, elle ne coûte rien ; étiquetée d'un
 * lieu faux, elle serait un chiffre présenté comme une mesure (§2).
 */

/** Ce que rend `scripts/contours-de-zone.mjs`, indexé par sélecteur de `ZONES`. */
export interface ContoursDeZone {
  seuilDegres: number
  contours: Record<string, { relation: number; polygones: LonLat[][][] }>
}

/** Ce qu'il faut d'une zone : son nom, et les limites qui la composent. */
export interface ZoneAContour {
  label: string
  areaSelectors: readonly string[]
}

/**
 * Combien de points d'une trace sont examinés, répartis du départ à
 * l'arrivée.
 *
 * Seuil de **recherche** et non de calcul : il ne change aucun nombre
 * affiché, seulement les mots par lesquels une sortie se retrouve. Tranché
 * au jugement (§2) — cinquante points rangent une sortie de 20 km tous les
 * 400 m, et une trace qui n'entre dans une zone que sur moins d'un
 * cinquantième de sa longueur peut ne pas y être retrouvée. Écartés : tous
 * les points, soit huit cents fois dix mille tests pour l'archive de Karim ;
 * le seul départ, qui rate la traversée d'un département à l'autre.
 */
export const POINTS_EXAMINES_PAR_TRACE = 50

/**
 * Un anneau aplati : `[x0, y0, x1, y1, …]`. Le point-dans-polygone y lit des
 * nombres plutôt que des tableaux `[lon, lat]` — mesuré le 30/10, c'est ce
 * qui le rendait lent : 3,9 s pour 800 traces autour de Grenoble, dont les
 * points tombent dans les boîtes de la Savoie et de la Drôme.
 */
type AnneauPlat = Float64Array

function aplatir(anneaux: readonly LonLat[][]): AnneauPlat[] {
  return anneaux.map((anneau) => Float64Array.from(anneau.flat()))
}

/** Règle pair-impair sur tous les anneaux : un trou n'est pas dedans. */
function dansLesAnneaux(x: number, y: number, anneaux: readonly AnneauPlat[]): boolean {
  let dedans = false
  for (const a of anneaux) {
    const n = a.length
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = a[i] as number
      const yi = a[i + 1] as number
      const xj = a[j] as number
      const yj = a[j + 1] as number
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        dedans = !dedans
      }
    }
  }
  return dedans
}

/**
 * Le point est-il dans le polygone ? Règle pair-impair sur tous les
 * anneaux : un trou (une enclave) n'est donc pas dedans. La même boucle que
 * celle des contours préparés, et non une copie (§4ter).
 */
export function dansLePolygone(point: LonLat, anneaux: readonly LonLat[][]): boolean {
  return dansLesAnneaux(point[0], point[1], aplatir(anneaux))
}

type Boite = [ouest: number, sud: number, est: number, nord: number]

function boiteDe(polygones: readonly LonLat[][][]): Boite {
  const boite: Boite = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of polygones.flat(2)) {
    boite[0] = Math.min(boite[0], lon)
    boite[1] = Math.min(boite[1], lat)
    boite[2] = Math.max(boite[2], lon)
    boite[3] = Math.max(boite[3], lat)
  }
  return boite
}

/*
  Chaque contour préparé une fois par fichier chargé : sa boîte, qui écarte
  d'un coup presque toutes les zones, et ses anneaux aplatis, sur lesquels
  le point-dans-polygone ne tourne que pour les zones dont la boîte contient
  le point.
*/
interface ContourPrepare {
  boite: Boite
  polygones: AnneauPlat[][]
}

const prepares = new WeakMap<ContoursDeZone, Map<string, ContourPrepare>>()

function preparer(contours: ContoursDeZone): Map<string, ContourPrepare> {
  let parSelecteur = prepares.get(contours)
  if (!parSelecteur) {
    parSelecteur = new Map(
      Object.entries(contours.contours).map(([s, c]) => [
        s,
        { boite: boiteDe(c.polygones), polygones: c.polygones.map(aplatir) },
      ]),
    )
    prepares.set(contours, parSelecteur)
  }
  return parSelecteur
}

function echantillon(points: readonly LonLat[]): LonLat[] {
  if (points.length <= POINTS_EXAMINES_PAR_TRACE) return [...points]
  // Le premier et le dernier compris : l'arrivée est souvent ailleurs.
  const pas = (points.length - 1) / (POINTS_EXAMINES_PAR_TRACE - 1)
  return Array.from(
    { length: POINTS_EXAMINES_PAR_TRACE },
    (_, i) => points[Math.round(i * pas)] as LonLat,
  )
}

/** Le contour d'un sélecteur contient-il l'un des points ? */
function contient(contours: ContoursDeZone, selecteur: string, points: LonLat[]): boolean {
  const contour = preparer(contours).get(selecteur)
  if (!contour) return false
  const { boite, polygones } = contour
  return points.some(
    ([x, y]) =>
      x >= boite[0] &&
      x <= boite[2] &&
      y >= boite[1] &&
      y <= boite[3] &&
      polygones.some((anneaux) => dansLesAnneaux(x, y, anneaux)),
  )
}

/**
 * Une zone faite d'autres zones : chacune de ses limites appartient déjà à
 * une zone plus petite. « Rhône, Loire et Pilat » en est une, « Rhône +
 * Métropole de Lyon » non — ses deux limites ne sont celles d'aucune autre
 * zone à elles seules.
 *
 * La nommer n'ajoute que des mots faux : une sortie à Roanne recevait
 * « Pilat », et « pilat » retrouvait toutes les sorties du Rhône et de la
 * Loire (relecture adverse du 30/10). Ses parties, elles, sont nommées.
 */
export function estComposite(zone: ZoneAContour, zones: readonly ZoneAContour[]): boolean {
  return (
    zone.areaSelectors.length > 1 &&
    zone.areaSelectors.every((s) =>
      zones.some(
        (autre) =>
          autre !== zone &&
          autre.areaSelectors.length < zone.areaSelectors.length &&
          autre.areaSelectors.includes(s),
      ),
    )
  )
}

/*
  Les lieux de chaque trace, gardés par fichier de contours et par tableau de
  points : l'historique se recalcule à chaque import ou suppression, et ne
  doit refaire que les traces nouvelles. Mesuré par la relecture du 30/10 :
  jusqu'à 2 s pour 800 traces traversant l'Ain, la Drôme et l'Isère.
*/
const lieuxGardes = new WeakMap<ContoursDeZone, WeakMap<readonly LonLat[], string[]>>()

/**
 * Le nom des zones où passe la trace, dans l'ordre de `ZONES`, zones
 * composites exceptées (`estComposite`).
 */
export function lieuxDeLaTrace(
  points: readonly LonLat[],
  contours: ContoursDeZone,
  zones: readonly ZoneAContour[] = ZONES,
): string[] {
  // Le cache ne vaut que pour les zones de l'application : une autre liste
  // rendrait d'autres noms pour les mêmes points.
  const garde = zones === ZONES ? lieuxGardes.get(contours) : undefined
  const deja = garde?.get(points)
  if (deja) return deja
  const lieux = calculerLieux(points, contours, zones)
  if (zones === ZONES) {
    const parPoints = garde ?? new WeakMap<readonly LonLat[], string[]>()
    parPoints.set(points, lieux)
    lieuxGardes.set(contours, parPoints)
  }
  return lieux
}

function calculerLieux(
  points: readonly LonLat[],
  contours: ContoursDeZone,
  zones: readonly ZoneAContour[],
): string[] {
  const examines = echantillon(points)
  if (examines.length === 0) return []
  const parSelecteur = new Map<string, boolean>()
  const passe = (s: string) => {
    let oui = parSelecteur.get(s)
    if (oui === undefined) {
      oui = contient(contours, s, examines)
      parSelecteur.set(s, oui)
    }
    return oui
  }
  return zones
    .filter((z) => !estComposite(z, zones) && z.areaSelectors.some(passe))
    .map((z) => z.label)
}
