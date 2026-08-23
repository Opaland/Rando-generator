import {
  EARTH_RADIUS_METERS,
  cellIndices,
  cellKeyFromIndices,
  distanceMeters,
  distanceToSegmentMeters,
} from './geo.ts'
import { sampleWay } from './sampling.ts'
import type {
  CompletionResult,
  Itinerary,
  LonLat,
  Network,
  Sample,
} from './types.ts'
import { CELL_SIZE_DEG, STEP_METERS } from './types.ts'

/**
 * Le matching répond à une seule question : quelle part d'un itinéraire
 * l'utilisateur a-t-il réellement parcourue ? Trois garde-fous, chacun
 * corrigeant un faux résultat mesuré (voir tests/unit/matchingQuality.test.ts) :
 *
 * 1. **Distance au segment GPS**, pas au point GPS. Un appareil qui
 *    n'enregistre qu'un point tous les 500 m suit pourtant le sentier entre
 *    deux relevés ; l'ancienne version ne créditait que les abords des points.
 * 2. **Continuité** : un passage n'est crédité que s'il couvre plusieurs
 *    échantillons consécutifs. Couper un GR perpendiculairement ne le parcourt
 *    pas, et ne doit pas créditer les 200 m autour du croisement.
 * 3. **Confirmation de proximité** : un passage n'est crédité que si une part
 *    suffisante de ses échantillons est *nettement* plus proche que la
 *    tolérance. Marcher sur une route qui longe le GR à 30 m produit un écart
 *    constant, jamais la proximité franche d'un vrai passage — c'était le faux
 *    positif le plus grave, il créditait 100 % d'un sentier jamais foulé.
 */

export interface AggregateStats {
  doneMeters: number
  totalMeters: number
  pct: number
}

export interface MatchResult {
  samples: Sample[]
  results: CompletionResult[]
  /** Totaux toutes randos, chaque way partagé compté une seule fois. */
  global: AggregateStats
  byNetwork: Record<Network, AggregateStats>
}

/**
 * Au-delà de cet écart, deux points GPS successifs ne décrivent plus une
 * marche mais une coupure (trajet en voiture, appareil éteint) : le trajet
 * entre les deux n'est pas supposé parcouru.
 *
 * Le seuil est haut à dessein : certains appareils n'enregistrent qu'un point
 * toutes les quelques minutes, soit plusieurs centaines de mètres, sans que
 * la marche ait été interrompue. Faute d'horodatage par point (le parseur ne
 * le conserve pas), la distance est le seul critère disponible — un contrôle
 * de vitesse serait plus juste et reste à faire.
 */
const MAX_GAP_METERS = 1_000

/** Échantillons consécutifs minimum pour créditer un passage (~300 m). */
const MIN_RUN_SAMPLES = 3

/** Part de la tolérance en deçà de laquelle un échantillon est « confirmé ». */
const CONFIRM_FACTOR = 0.4

/** Part minimale d'échantillons confirmés pour créditer un passage. */
const CONFIRM_RATIO = 0.25

export interface MatchOptions {
  toleranceMeters: number
  stepMeters?: number
  /** Horodatage ISO des résultats — injecté pour garder la fonction pure. */
  computedAt: string
  minRunSamples?: number
  confirmRatio?: number
}

/**
 * Échantillonne les ways de tous les itinéraires, en dédupliquant par way id :
 * un way partagé est échantillonné une fois et rattaché à chaque itinéraire.
 */
export function buildSamples(
  itineraries: Itinerary[],
  stepMeters: number,
): Sample[] {
  const byWay = new Map<number, { coords: LonLat[]; itineraryIds: number[] }>()
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      const entry = byWay.get(way.osmWayId)
      if (entry) {
        if (!entry.itineraryIds.includes(itin.osmRelationId)) {
          entry.itineraryIds.push(itin.osmRelationId)
        }
      } else {
        byWay.set(way.osmWayId, {
          coords: way.coords,
          itineraryIds: [itin.osmRelationId],
        })
      }
    }
  }

  const samples: Sample[] = []
  for (const [wayId, { coords, itineraryIds }] of byWay) {
    for (const [lon, lat] of sampleWay(coords, stepMeters)) {
      samples.push({ lon, lat, wayId, itineraryIds, done: false })
    }
  }
  return samples
}

/** Segment de trace GPS ; a === b pour un point isolé. */
interface TrackSegment {
  a: LonLat
  b: LonLat
}

/** Segments de la trace indexés par cellule de hachage spatial. */
type TrackIndex = Map<string, TrackSegment[]>

function addToCells(index: TrackIndex, segment: TrackSegment): void {
  const [ax, ay] = cellIndices(segment.a[0], segment.a[1])
  const [bx, by] = cellIndices(segment.b[0], segment.b[1])
  for (let cx = Math.min(ax, bx); cx <= Math.max(ax, bx); cx++) {
    for (let cy = Math.min(ay, by); cy <= Math.max(ay, by); cy++) {
      const key = cellKeyFromIndices(cx, cy)
      const bucket = index.get(key)
      if (bucket) bucket.push(segment)
      else index.set(key, [segment])
    }
  }
}

/**
 * Indexe la trace GPS sous forme de segments. Les sauts de plus de
 * MAX_GAP_METERS sont conservés comme deux points isolés plutôt que comme un
 * segment : rien ne dit que l'utilisateur a marché entre les deux.
 */
function buildTrackIndex(points: LonLat[]): TrackIndex {
  const index: TrackIndex = new Map()
  if (points.length === 0) return index
  if (points.length === 1) {
    const only = points[0] as LonLat
    addToCells(index, { a: only, b: only })
    return index
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as LonLat
    const b = points[i] as LonLat
    if (distanceMeters(a, b) > MAX_GAP_METERS) {
      addToCells(index, { a, b: a })
      addToCells(index, { a: b, b })
    } else {
      addToCells(index, { a, b })
    }
  }
  return index
}

/**
 * Combien de cellules balayer en longitude pour couvrir la tolérance
 * (issue #170).
 *
 * Le hachage découpe l'espace en carrés **de degrés**, et un degré de
 * longitude rétrécit avec la latitude : la cellule fait 118 m de large à
 * 45°, et 17 m à 84°. Balayer les huit voisines suffisait donc en France et
 * plus du tout au-delà — mesuré, trace nord-sud et passage à 35 m sous une
 * tolérance de 100 m : 100 % jusqu'à 80°, puis **0 %** à 82° ou 84° selon
 * l'endroit où la trace tombe dans la grille. Deux randonnées identiques
 * séparées de 80 m, l'une créditée et l'autre non, sans que rien ne le dise.
 *
 * Ce rayon n'est pas un réglage : il se **dérive** de la largeur d'une
 * cellule à cette latitude et de la tolérance demandée. À 45°, il vaut 1 —
 * la France ne change pas de comportement et ne paie rien.
 *
 * La borne finale n'est pas une coquetterie. `Math.cos(Math.PI / 2)` vaut
 * 6,1 × 10⁻¹⁷ et non zéro : sans elle, le rayon calculé au pôle atteindrait
 * le million de cellules et la boucle ne rendrait jamais la main. Le même
 * piège avait fait tourner un test dix minutes dans `corridor.ts`.
 */
export function rayonCellules(lat: number, toleranceMeters: number): number {
  const cotes = Math.ceil(360 / CELL_SIZE_DEG)
  const largeurCellule =
    EARTH_RADIUS_METERS *
    (Math.PI / 180) *
    Math.cos((lat * Math.PI) / 180) *
    CELL_SIZE_DEG
  if (!(largeurCellule > 0)) return cotes
  return Math.min(cotes, Math.max(1, Math.ceil(toleranceMeters / largeurCellule)))
}

/**
 * Distance du point à la trace, en ne testant que les cellules qui peuvent
 * contenir un passage à portée de la tolérance.
 *
 * Le rayon vaut 1 aux latitudes françaises — soit exactement les neuf
 * cellules d'avant — et s'élargit là où les cellules rétrécissent.
 */
function distanceToTrack(
  index: TrackIndex,
  point: LonLat,
  toleranceMeters: number,
): number {
  const [cx, cy] = cellIndices(point[0], point[1])
  const rayonX = rayonCellules(point[1], toleranceMeters)
  // En latitude, une cellule vaut 167 m partout : le calcul est celui de la
  // longitude à la latitude zéro, et il ne dépend pas du point — hors de la
  // boucle, donc.
  const rayonY = rayonCellules(0, toleranceMeters)
  let best = Infinity
  for (let dx = -rayonX; dx <= rayonX; dx++) {
    for (let dy = -rayonY; dy <= rayonY; dy++) {
      const bucket = index.get(cellKeyFromIndices(cx + dx, cy + dy))
      if (!bucket) continue
      for (const segment of bucket) {
        const distance = distanceToSegmentMeters(point, segment.a, segment.b)
        if (distance < best) best = distance
      }
    }
  }
  return best
}

/** Renseigne la distance de chaque échantillon à la trace, et un premier `done`. */
function matchSamples(
  samples: Sample[],
  index: TrackIndex,
  toleranceMeters: number,
): void {
  for (const sample of samples) {
    const distance = distanceToTrack(
      index,
      [sample.lon, sample.lat],
      toleranceMeters,
    )
    sample.distanceMeters = distance
    sample.done = distance <= toleranceMeters
  }
}

interface ContinuityOptions {
  minRunSamples: number
  confirmMeters: number
  confirmRatio: number
}

/**
 * Invalide les passages trop courts ou jamais franchement proches du sentier.
 * Les échantillons d'un même way sont contigus et ordonnés (cf. buildSamples),
 * ce qui permet de raisonner par suites consécutives.
 */
function applyContinuity(
  samples: Sample[],
  options: ContinuityOptions,
): void {
  const byWay = new Map<number, Sample[]>()
  for (const sample of samples) {
    const bucket = byWay.get(sample.wayId)
    if (bucket) bucket.push(sample)
    else byWay.set(sample.wayId, [sample])
  }

  for (const waySamples of byWay.values()) {
    // Un way plus court que le minimum ne doit pas devenir incréditable :
    // on exige alors simplement qu'il soit couvert en entier.
    const minRun = Math.min(options.minRunSamples, waySamples.length)
    let start = 0
    while (start < waySamples.length) {
      if (!(waySamples[start] as Sample).done) {
        start += 1
        continue
      }
      let end = start
      while (end + 1 < waySamples.length && (waySamples[end + 1] as Sample).done) {
        end += 1
      }
      const run = waySamples.slice(start, end + 1)
      const confirmed = run.filter(
        (sample) => (sample.distanceMeters ?? Infinity) <= options.confirmMeters,
      ).length
      const tooShort = run.length < minRun
      const neverClose = confirmed / run.length < options.confirmRatio
      if (tooShort || neverClose) {
        for (const sample of run) sample.done = false
      }
      start = end + 1
    }
  }
}

function emptyStats(): AggregateStats {
  return { doneMeters: 0, totalMeters: 0, pct: 0 }
}

function finalizePct(stats: AggregateStats): void {
  stats.pct =
    stats.totalMeters === 0 ? 0 : (stats.doneMeters / stats.totalMeters) * 100
}

/**
 * Agrège les échantillons matés en résultats : par itinéraire, globaux
 * (way partagé compté une fois) et par réseau.
 */
function computeCompletion(
  samples: Sample[],
  itineraries: Itinerary[],
  stepMeters: number,
  computedAt: string,
): Omit<MatchResult, 'samples'> {
  const perItinerary = new Map<number, { done: number; total: number }>()
  for (const itin of itineraries) {
    perItinerary.set(itin.osmRelationId, { done: 0, total: 0 })
  }
  const networkOf = new Map<number, Network>(
    itineraries.map((itin) => [itin.osmRelationId, itin.network]),
  )

  const global = emptyStats()
  const byNetwork: Record<Network, AggregateStats> = {
    GR: emptyStats(),
    GRP: emptyStats(),
    PR: emptyStats(),
    LOCAL: emptyStats(),
    PERSO: emptyStats(),
  }

  for (const sample of samples) {
    global.totalMeters += stepMeters
    if (sample.done) global.doneMeters += stepMeters

    const seenNetworks = new Set<Network>()
    for (const itineraryId of sample.itineraryIds) {
      const counts = perItinerary.get(itineraryId)
      if (counts) {
        counts.total += 1
        if (sample.done) counts.done += 1
      }
      const network = networkOf.get(itineraryId)
      if (network && !seenNetworks.has(network)) {
        seenNetworks.add(network)
        byNetwork[network].totalMeters += stepMeters
        if (sample.done) byNetwork[network].doneMeters += stepMeters
      }
    }
  }

  finalizePct(global)
  for (const network of Object.keys(byNetwork) as Network[]) {
    finalizePct(byNetwork[network])
  }

  const results: CompletionResult[] = itineraries.map((itin) => {
    const counts = perItinerary.get(itin.osmRelationId) ?? {
      done: 0,
      total: 0,
    }
    return {
      itineraryId: itin.osmRelationId,
      doneMeters: counts.done * stepMeters,
      totalMeters: counts.total * stepMeters,
      pct: counts.total === 0 ? 0 : (counts.done / counts.total) * 100,
      computedAt,
    }
  })

  return { results, global, byNetwork }
}

/** Pipeline complet : échantillonnage, index de segments, matching, continuité. */
/**
 * L'espacement médian de cette trace dépasse-t-il ce que le matching sait
 * relier ? Rend la médiane en mètres si oui, null sinon (issue #148).
 *
 * Ce n'est pas une dégradation, c'est une falaise. Mesuré sur un sentier
 * droit de 7,8 km entièrement parcouru, tolérance 50 m, en ne faisant varier
 * que l'espacement : 780 m créditent 100 %, 1,2 km créditent 0 %. Au-delà de
 * `MAX_GAP_METERS`, le segment est cassé en points isolés, la continuité
 * minimale n'est plus satisfaite, et plus rien n'est crédité.
 *
 * Une montre en économie de batterie, un export « smart recording » ou un
 * GPX simplifié tombent tous dans ce cas. L'utilisateur importe une sortie
 * réelle et complète, lit 0 %, et conclut que l'application est cassée.
 *
 * **La médiane, et non le maximum** : une trace dense avec une seule pause
 * de plusieurs kilomètres est précisément ce que `MAX_GAP_METERS` protège —
 * le trajet en voiture entre deux sorties. Avertir dans ce cas serait un
 * faux positif, et transformerait une garde utile en bruit.
 *
 * Ce que cette fonction ne fait PAS : créditer quand même. Un point tous
 * les 1,5 km sur une ligne droite reste de l'information, mais savoir si on
 * peut la créditer sans rouvrir la faille du trajet en voiture demande une
 * vitesse — donc les horodatages de #149, et un corpus de traces réelles
 * qui n'existe pas encore. Cette fonction supprime la pire conséquence, le
 * silence ; elle ne prétend pas résoudre le fond.
 */
export function espacementTropGrand(points: LonLat[]): number | null {
  if (points.length < 2) return null
  const ecarts: number[] = []
  for (let i = 1; i < points.length; i += 1) {
    ecarts.push(distanceMeters(points[i - 1] as LonLat, points[i] as LonLat))
  }
  ecarts.sort((a, b) => a - b)
  const milieu = Math.floor(ecarts.length / 2)
  const mediane =
    ecarts.length % 2 === 1
      ? (ecarts[milieu] as number)
      : ((ecarts[milieu - 1] as number) + (ecarts[milieu] as number)) / 2
  return mediane > MAX_GAP_METERS ? mediane : null
}

/**
 * La seule porte d'entrée du calcul de complétion.
 *
 * Les étapes intermédiaires (index, échantillonnage, continuité) et les
 * quatre constantes de réglage sont volontairement privées : ce sont elles
 * qui décident de ce qui est « parcouru », et les exposer en ferait une API
 * dont tout changement devient une rupture. Les trois fichiers de tests du
 * matching passent déjà par ici, ce qui est la bonne façon de le tester.
 *
 * `buildSamples` reste exporté : deux tests de modules voisins l'utilisent
 * comme fabrique de données, sans rien décider du calcul.
 */
export function runMatching(
  itineraries: Itinerary[],
  trackPoints: LonLat[],
  options: MatchOptions,
): MatchResult {
  const stepMeters = options.stepMeters ?? STEP_METERS
  const samples = buildSamples(itineraries, stepMeters)
  const index = buildTrackIndex(trackPoints)
  matchSamples(samples, index, options.toleranceMeters)
  applyContinuity(samples, {
    minRunSamples: options.minRunSamples ?? MIN_RUN_SAMPLES,
    confirmMeters: options.toleranceMeters * CONFIRM_FACTOR,
    confirmRatio: options.confirmRatio ?? CONFIRM_RATIO,
  })
  return {
    samples,
    ...computeCompletion(samples, itineraries, stepMeters, options.computedAt),
  }
}
