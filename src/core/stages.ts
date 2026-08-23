import { formatKm } from '../lib/format.ts'
import type { GpxWaypoint } from './gpxExport.ts'
import type { Itinerary, LonLat, Sample, TrailWay } from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * Découpage d'un long itinéraire en étapes.
 *
 * « 12 % du GR 7 » ne dit rien d'utile sur 400 km : ni où on en est, ni ce
 * qu'il reste de faisable en une sortie. Les topo-guides raisonnent en
 * étapes ; on fait pareil, sauf qu'on n'a pas le droit de reprendre leur
 * découpage — les étapes officielles sont éditoriales et protégées. Celles-ci
 * sont donc calculées, régulières, et présentées comme telles.
 *
 * L'unité est l'échantillon de matching (un point tous les STEP_METERS) :
 * une étape mesure exactement ce que le pourcentage mesure, donc les deux
 * chiffres ne peuvent pas se contredire.
 */

/** Longueur visée d'une étape : une journée de marche soutenue. */
export const DEFAULT_STAGE_METERS = 20_000

/** En dessous, découper n'apprend rien — une étape unique n'est pas une étape. */
export const MIN_STAGED_METERS = 30_000

/** Un reliquat plus court que cette part d'étape est rattaché à la précédente. */
const MERGE_RATIO = 0.5

export interface Stage {
  /** Numéro d'étape, à partir de 1. */
  index: number
  startMeters: number
  endMeters: number
  meters: number
  doneMeters: number
  pct: number
  start: LonLat
  end: LonLat
  /** Cadre englobant [sud-ouest, nord-est], pour zoomer dessus. */
  bounds: [LonLat, LonLat]
}

export interface StageOptions {
  stageMeters?: number
  stepMeters?: number
  minStagedMeters?: number
}

/** Précision de regroupement des extrémités de tronçons (~1 m). */
const NODE_PRECISION_DEG = 1e-5

function nodeKey(point: LonLat): string {
  return `${Math.round(point[0] / NODE_PRECISION_DEG)},${Math.round(point[1] / NODE_PRECISION_DEG)}`
}

export interface Maillon {
  wayId: number
  reversed: boolean
  /** Premier point du tronçon, dans le sens de la marche. */
  start: LonLat
  /** Dernier point du tronçon, dans le sens de la marche. */
  end: LonLat
  /**
   * Vrai quand ce tronçon ne s'accroche pas au précédent : la relation est
   * trouée (ou ramifiée) et la chaîne repart d'ailleurs. C'est ce que
   * `core/dataQuality.ts` mesure pour prévenir l'utilisateur.
   */
  newPiece: boolean
}

/**
 * Remet les tronçons dans l'ordre du chemin. Les membres d'une relation OSM
 * ne sont pas toujours ordonnés, et un tronçon peut être décrit dans le sens
 * inverse de la marche. On part d'une extrémité libre quand il y en a une,
 * puis on enchaîne de proche en proche ; ce qui reste (relation trouée ou
 * ramifiée) est ajouté dans l'ordre donné, pour ne perdre aucun kilomètre.
 */
export function chainWays(ways: TrailWay[]): Maillon[] {
  const utilisables = ways.filter((w) => w.coords.length >= 2)
  if (utilisables.length === 0) return []

  const parNoeud = new Map<string, number[]>()
  utilisables.forEach((w, index) => {
    for (const extremite of [w.coords[0], w.coords[w.coords.length - 1]]) {
      if (!extremite) continue
      const cle = nodeKey(extremite)
      const liste = parNoeud.get(cle)
      if (liste) liste.push(index)
      else parNoeud.set(cle, [index])
    }
  })

  // Départ : une extrémité qui n'appartient qu'à un seul tronçon.
  let depart = 0
  let departInverse = false
  for (const [cle, indices] of parNoeud) {
    if (indices.length !== 1) continue
    const index = indices[0] as number
    const way = utilisables[index] as TrailWay
    depart = index
    departInverse = nodeKey(way.coords[way.coords.length - 1] as LonLat) === cle
    break
  }

  const utilise = new Set<number>()
  const chaine: Maillon[] = []

  const ajouter = (index: number, reversed: boolean, newPiece: boolean): LonLat => {
    const way = utilisables[index] as TrailWay
    utilise.add(index)
    const premier = way.coords[0] as LonLat
    const dernier = way.coords[way.coords.length - 1] as LonLat
    chaine.push({
      wayId: way.osmWayId,
      reversed,
      start: reversed ? dernier : premier,
      end: reversed ? premier : dernier,
      newPiece,
    })
    return reversed ? premier : dernier
  }

  let fin = ajouter(depart, departInverse, true)
  while (utilise.size < utilisables.length) {
    const candidats = parNoeud.get(nodeKey(fin)) ?? []
    const suivant = candidats.find((i) => !utilise.has(i))
    if (suivant === undefined) {
      // Trou dans la relation : on reprend au premier tronçon non utilisé.
      const reste = utilisables.findIndex((_, i) => !utilise.has(i))
      if (reste < 0) break
      fin = ajouter(reste, false, true)
      continue
    }
    const way = utilisables[suivant] as TrailWay
    const reversed = nodeKey(way.coords[way.coords.length - 1] as LonLat) === nodeKey(fin)
    fin = ajouter(suivant, reversed, false)
  }
  return chaine
}

/** Échantillons de cet itinéraire, remis dans l'ordre de la marche. */
function orderedSamples(itinerary: Itinerary, samples: Sample[]): Sample[] {
  const parWay = new Map<number, Sample[]>()
  for (const sample of samples) {
    if (!sample.itineraryIds.includes(itinerary.osmRelationId)) continue
    const liste = parWay.get(sample.wayId)
    if (liste) liste.push(sample)
    else parWay.set(sample.wayId, [sample])
  }
  const ordonnes: Sample[] = []
  for (const maillon of chainWays(itinerary.ways)) {
    const groupe = parWay.get(maillon.wayId)
    if (!groupe) continue
    parWay.delete(maillon.wayId)
    ordonnes.push(...(maillon.reversed ? [...groupe].reverse() : groupe))
  }
  // Tronçons sans place dans la chaîne (géométrie absente) : conservés.
  for (const groupe of parWay.values()) ordonnes.push(...groupe)
  return ordonnes
}

function boundsOf(points: Sample[]): [LonLat, LonLat] {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const p of points) {
    minLon = Math.min(minLon, p.lon)
    minLat = Math.min(minLat, p.lat)
    maxLon = Math.max(maxLon, p.lon)
    maxLat = Math.max(maxLat, p.lat)
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ]
}

/**
 * Découpe l'itinéraire en étapes régulières et calcule la progression de
 * chacune. Retourne une liste vide quand le découpage n'apporte rien.
 */
export function buildStages(
  itinerary: Itinerary,
  samples: Sample[],
  options: StageOptions = {},
): Stage[] {
  const stageMeters = options.stageMeters ?? DEFAULT_STAGE_METERS
  const stepMeters = options.stepMeters ?? STEP_METERS
  const minStaged = options.minStagedMeters ?? MIN_STAGED_METERS

  const ordonnes = orderedSamples(itinerary, samples)
  const longueur = ordonnes.length * stepMeters
  if (longueur < minStaged) return []

  const parEtape = Math.max(1, Math.round(stageMeters / stepMeters))
  const etapes: Stage[] = []
  for (let debut = 0; debut < ordonnes.length; debut += parEtape) {
    let fin = Math.min(debut + parEtape, ordonnes.length)
    // Un reliquat trop court n'est pas une étape : on l'ajoute à celle-ci.
    if (ordonnes.length - fin < parEtape * MERGE_RATIO) fin = ordonnes.length
    const tranche = ordonnes.slice(debut, fin)
    const premier = tranche[0]
    const dernier = tranche[tranche.length - 1]
    if (!premier || !dernier) break
    const meters = tranche.length * stepMeters
    const doneMeters = tranche.filter((s) => s.done).length * stepMeters
    etapes.push({
      index: etapes.length + 1,
      startMeters: debut * stepMeters,
      endMeters: fin * stepMeters,
      meters,
      doneMeters,
      pct: meters > 0 ? (doneMeters / meters) * 100 : 0,
      start: [premier.lon, premier.lat],
      end: [dernier.lon, dernier.lat],
      bounds: boundsOf(tranche),
    })
    debut = fin - parEtape
  }
  return etapes
}

/**
 * Les repères à poser sur le GPX d'un itinéraire découpé (issue #161).
 *
 * Camille prépare trois semaines sur la Grande Traversée des Alpes. Jusqu'ici
 * seul l'itinéraire complet s'exportait : elle ne pouvait pas emporter **son
 * découpage**, c'est-à-dire la seule chose qu'elle avait construite ici.
 *
 * Un départ, une fin par étape. La dernière s'appelle « Arrivée » et non
 * « Fin d'étape » : ce n'est pas là qu'on dort, c'est là qu'on s'arrête — et
 * une montre qui affiche vingt et un « Fin d'étape » n'aide personne à
 * reconnaître le dernier.
 */
export function waypointsDesEtapes(stages: Stage[]): GpxWaypoint[] {
  const premiere = stages[0]
  if (!premiere) return []
  const reperes: GpxWaypoint[] = [
    { lon: premiere.start[0], lat: premiere.start[1], name: 'Départ' },
  ]
  for (const [rang, etape] of stages.entries()) {
    const derniere = rang === stages.length - 1
    reperes.push({
      lon: etape.end[0],
      lat: etape.end[1],
      name: derniere
        ? `Arrivée — ${formatKm(etape.endMeters)}`
        : `Fin d’étape ${String(etape.index)} — ${formatKm(etape.endMeters)}`,
    })
  }
  return reperes
}
