import { formatKm } from '../lib/format.ts'
import { distanceMeters } from './geo.ts'
import { chainWays } from './chainage.ts'
import type { GpxWaypoint } from './gpxExport.ts'
import type {
  Itinerary,
  LonLat,
  PoiKind,
  PointOfInterest,
  Sample,
} from './types.ts'
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

/**
 * Caler les étapes sur les couchages (issue #161, point 1).
 *
 * Camille prépare trois semaines sur la Grande Traversée des Alpes. Un
 * découpage tous les 22 km qui la fait dormir à 4 km d'un refuge est joli sur
 * le papier et inutilisable sur le terrain. Les refuges sont déjà
 * téléchargés et classés ; le découpage les ignorait.
 *
 * ## La fenêtre ne s'invente pas
 *
 * Déplacer une coupure demande de dire jusqu'où, et ce nombre-là **change ce
 * qui est calculé** : CLAUDE.md §2 interdit de le poser au jugement.
 *
 * Il ne l'est pas. La fenêtre est **la moitié de la longueur d'étape**,
 * parce que c'est le plus grand déplacement qui garde les coupures dans
 * l'ordre : au-delà, une coupure passerait devant sa voisine et les étapes se
 * croiseraient. La géométrie du problème donne la borne ; il n'y avait rien
 * à décider.
 */

/** Un endroit où dormir, situé le long du tracé. */
export interface CouchageSitue {
  nom: string
  /** Distance depuis le départ, mesurée sur le tracé. */
  metresLeLongDuTrace: number
  /** Aller-retour depuis le tracé — ce que le détour coûte vraiment. */
  detourMetres: number
}

/** Une étape, et le couchage sur lequel sa fin a été calée s'il y en a un. */
export interface EtapeCalee extends Stage {
  couchage: CouchageSitue | null
}

/**
 * Déplace la fin de chaque étape vers le couchage le plus proche, dans la
 * fenêtre. La dernière coupure est l'arrivée : elle ne bouge pas.
 *
 * Un couchage ne sert qu'une fois, et c'est **la garde d'ordre qui l'assure**
 * — pas un registre des couchages déjà pris. J'en avais écrit un ; en
 * l'ôtant, aucun test ne rougissait. C'était du code mort : une fois une
 * coupure calée sur un refuge, l'étape suivante démarre exactement là, et
 * `metresLeLongDuTrace <= startMeters` écarte ce refuge d'elle-même.
 *
 * Le test qui affirmait cet invariant passait donc pour une raison que je
 * n'avais pas voulue (CLAUDE.md §1bis). Il reste, parce que l'invariant
 * compte ; ce qui a disparu, c'est la ceinture qui doublait la bretelle.
 */
export function calerSurCouchages(
  etapes: Stage[],
  couchages: CouchageSitue[],
  stageMeters: number,
): EtapeCalee[] {
  const fenetre = stageMeters / 2
  const calees: EtapeCalee[] = etapes.map((e) => ({ ...e, couchage: null }))

  for (let i = 0; i < calees.length - 1; i++) {
    const etape = calees[i] as EtapeCalee
    const suivante = calees[i + 1] as EtapeCalee
    let meilleur: CouchageSitue | null = null
    let ecartMeilleur = Infinity
    for (const c of couchages) {
      const ecart = Math.abs(c.metresLeLongDuTrace - etape.endMeters)
      if (ecart > fenetre) continue
      // La coupure ne doit ni précéder le départ de son étape, ni dépasser
      // l'arrivée de la suivante : sinon l'ordre se casse.
      if (c.metresLeLongDuTrace <= etape.startMeters) continue
      if (c.metresLeLongDuTrace >= suivante.endMeters) continue
      if (ecart < ecartMeilleur) {
        meilleur = c
        ecartMeilleur = ecart
      }
    }
    if (!meilleur) continue
    const nouvelleFin = meilleur.metresLeLongDuTrace
    etape.endMeters = nouvelleFin
    etape.meters = nouvelleFin - etape.startMeters
    etape.couchage = meilleur
    suivante.startMeters = nouvelleFin
    suivante.meters = suivante.endMeters - nouvelleFin
  }
  return calees
}

/**
 * Les catégories où l'on passe la nuit.
 *
 * Nommée plutôt que recopiée : la question « peut-on y dormir » se pose
 * déjà à deux endroits — ici, pour caler une coupure, et dans
 * `POI_OVERNIGHT` qui pose la question voisine mais différente (« sans
 * réservation »). Trois gardes écrites à la main et une quatrième oubliée,
 * c'est le mode d'échec de CLAUDE.md §4 ; il n'y aura pas de quatrième
 * lecture de cette liste-ci.
 */
const EST_UN_COUCHAGE: ReadonlySet<PoiKind> = new Set<PoiKind>([
  'hut',
  'bivouac',
  'gite',
])

/**
 * Les endroits où l'on dort le long d'un tracé, dans l'ordre du parcours.
 *
 * Trois catégories, et la liste se lit comme une question : **peut-on y
 * passer la nuit ?**
 *
 * - `hut`, le refuge gardé, et `bivouac`, la cabane ou le refuge non gardé —
 *   le vocabulaire de la montagne, qui a fondé #161 ;
 * - `gite`, le gîte d'étape, ajouté le 23/08. Sans lui, un chemin de plaine
 *   comme celui de Saint-Jacques n'avait **aucun** couchage connu : ni
 *   refuge gardé ni cabane sur quatre cents kilomètres, et un découpage qui
 *   retombait au kilomètre sans jamais tomber où l'on dort.
 *
 * Un `shelter` reste dehors : c'est un abri météo, prévu pour une pause ou
 * une urgence. Y caler une étape enverrait quelqu'un dormir où l'on ne dort
 * pas, et la distinction existe déjà dans les données.
 */
export function couchagesLeLongDuTrace(
  pois: PointOfInterest[],
  trace: LonLat[],
): CouchageSitue[] {
  const cumul = distancesCumuleesDuTrace(trace)
  const couchages: CouchageSitue[] = []
  for (const poi of pois) {
    if (!EST_UN_COUCHAGE.has(poi.kind)) continue
    let meilleurIndex = 0
    let meilleureDistance = Infinity
    for (const [index, point] of trace.entries()) {
      const d = distanceMeters([poi.lon, poi.lat], point)
      if (d < meilleureDistance) {
        meilleureDistance = d
        meilleurIndex = index
      }
    }
    couchages.push({
      nom: poi.name ?? 'Couchage',
      metresLeLongDuTrace: cumul[meilleurIndex] ?? 0,
      detourMetres: meilleureDistance * 2,
    })
  }
  return couchages.sort((a, b) => a.metresLeLongDuTrace - b.metresLeLongDuTrace)
}

/** Distance cumulée depuis le départ, point par point. */
function distancesCumuleesDuTrace(trace: LonLat[]): number[] {
  const cumul: number[] = [0]
  for (let i = 1; i < trace.length; i++) {
    cumul.push(
      (cumul[i - 1] ?? 0) +
        distanceMeters(trace[i - 1] as LonLat, trace[i] as LonLat),
    )
  }
  return cumul
}
