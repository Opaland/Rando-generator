import { formatDuration } from '../lib/format.ts'
import { distanceMeters, distanceToSegmentMeters } from './geo.ts'
import { partsDeRevetement } from './revetement.ts'
import type { Itinerary, LonLat, TrailWay } from './types.ts'

/**
 * Découverte : aider à choisir une sortie, pas seulement à mesurer celles
 * déjà faites. Les questions qu'on se pose la veille au soir sont toujours
 * les mêmes — « combien de kilomètres, combien ça grimpe, combien de temps,
 * c'est loin de chez moi, et est-ce que je retrouve ma voiture au bout ? ».
 *
 * Principe de rigueur : on ne filtre jamais sur une donnée absente. Un
 * dénivelé inconnu n'est pas un dénivelé nul, et l'écarter ferait disparaître
 * silencieusement la quasi-totalité des tracés OSM, qui ne publient pas de D+.
 */

/** Vitesse de marche à plat retenue pour l'estimation (km/h). */
const FLAT_KMH = 4

/** Montée avalée en une heure (m) — règle de terrain française usuelle. */
const ASCENT_METERS_PER_HOUR = 300

/** Au-delà, la durée publiée est une coquille de saisie, pas une donnée. */
const MAX_PUBLISHED_MINUTES = 24 * 60

/**
 * Deux extrémités distantes de moins de cela sont « le même endroit » : un
 * parking, une place de village. Un circuit qui y revient est une boucle.
 */
const LOOP_TOLERANCE_METERS = 150

/** Précision de regroupement des extrémités de tronçons (~1 m). */
const NODE_PRECISION_DEG = 1e-5

/** Au plus ce nombre de points par itinéraire pour mesurer une proximité. */
const PROXIMITY_MAX_POINTS = 200

/** Forme du tracé. `unknown` : réseau ramifié ou géométrie insuffisante. */
type Shape = 'loop' | 'linear' | 'unknown'

export interface ItineraryFacts {
  meters: number
  /** D+ publié par la source, jamais deviné. */
  gainMeters: number | null
  minutes: number
  minutesSource: 'published' | 'estimated'
  shape: Shape
  /** Distance jusqu'au point le plus proche du tracé, si la position est connue. */
  awayMeters: number | null
  /**
   * Vrai si **toute** la longueur est d'un revêtement dur ou stabilisé.
   *
   * Faux dès qu'un mètre est naturel, « autre », ou simplement inconnu — un
   * itinéraire dont on ne sait rien n'est pas un itinéraire roulant (#179).
   */
  entierementRoulant: boolean
}

export interface DiscoveryFilters {
  minKm: number | null
  maxKm: number | null
  maxGain: number | null
  maxMinutes: number | null
  maxAwayKm: number | null
  shape: 'all' | 'loop' | 'linear'
  /**
   * Ce qu'il y a sous les pieds — ou sous les roues (issue #179).
   *
   * `roulant` ne garde que les itinéraires dont **toute** la longueur est
   * d'un revêtement dur ou stabilisé, et dont **rien** n'est inconnu.
   *
   * Ce filtre enfreint volontairement la règle de l'en-tête — « un filtre ne
   * s'applique jamais à une donnée absente ». Pour tous les autres, laisser
   * passer l'inconnu coûte au plus une déception : on découvre un itinéraire
   * un peu plus long que prévu. Ici, ça coûte à Nadia une journée et la
   * déception de sa fille, parce qu'elle sera partie avec un fauteuil
   * tout-terrain sur un sentier dont personne n'avait renseigné le sol.
   *
   * Elle sait lire une donnée absente. Ce qu'elle ne pardonne pas, c'est une
   * promesse fausse. **Le filtre doit donc exclure ce qu'on ignore, et pas
   * seulement ce qu'on sait mauvais.**
   *
   * « Toute la longueur » plutôt qu'un pourcentage : un seuil du genre
   * « 80 % roulant » changerait *ce qui est calculé*, et aucune donnée ne
   * permet de le fixer aujourd'hui (§2). Les deux extrêmes, eux, ne
   * s'inventent pas. La fiche affiche les parts réelles, pour que le cas
   * limite se juge à l'œil plutôt que par un nombre choisi au hasard.
   */
  sol: 'all' | 'roulant'
}

/** Aucun filtre actif : tout passe. */
export const ALL_FILTERS: DiscoveryFilters = {
  minKm: null,
  maxKm: null,
  maxGain: null,
  maxMinutes: null,
  maxAwayKm: null,
  shape: 'all',
  sol: 'all',
}

/**
 * Les paliers du panneau « Trouver une sortie », et la question en langage
 * naturel qui peut les piloter.
 *
 * Sortis d'`ItineraryList.tsx` (issue de dette du 17/10, le fichier
 * approchait son plafond de lignes) : `filters` s'en sert pour construire ce
 * qui filtre la liste, et le panneau de découverte pour afficher les menus —
 * les deux en ont besoin, donc ni l'un ni l'autre ne peut en garder la seule
 * copie (§4ter).
 */
export interface Plage {
  label: string
  minKm: number | null
  maxKm: number | null
}

export const TOUTES_LONGUEURS: Plage = { label: 'toutes', minKm: null, maxKm: null }

export const LONGUEURS: Plage[] = [
  TOUTES_LONGUEURS,
  { label: 'moins de 5 km', minKm: null, maxKm: 5 },
  { label: '5 à 10 km', minKm: 5, maxKm: 10 },
  { label: '10 à 20 km', minKm: 10, maxKm: 20 },
  { label: 'plus de 20 km', minKm: 20, maxKm: null },
]

export const DUREES: { label: string; minutes: number | null }[] = [
  { label: 'peu importe', minutes: null },
  { label: 'moins d’1 h', minutes: 60 },
  { label: 'moins de 2 h', minutes: 120 },
  { label: 'moins de 3 h', minutes: 180 },
  { label: 'moins de 4 h', minutes: 240 },
  { label: 'moins de 6 h', minutes: 360 },
]

export const DENIVELES: { label: string; gain: number | null }[] = [
  { label: 'peu importe', gain: null },
  { label: 'moins de 100 m', gain: 100 },
  { label: 'moins de 300 m', gain: 300 },
  { label: 'moins de 600 m', gain: 600 },
  { label: 'moins de 1 000 m', gain: 1_000 },
]

export const PROXIMITES: { label: string; km: number | null }[] = [
  { label: 'partout', km: null },
  { label: 'à moins de 5 km', km: 5 },
  { label: 'à moins de 10 km', km: 10 },
  { label: 'à moins de 25 km', km: 25 },
  { label: 'à moins de 50 km', km: 50 },
]

/** Les quatre listes qu'une question peut piloter. */
export const CHAMPS_PILOTES = [
  'longueur',
  'duree',
  'denivele',
  'proximite',
] as const
export type ChampPilote = (typeof CHAMPS_PILOTES)[number]

/**
 * Les champs de `DiscoveryFilters` derrière chaque liste.
 *
 * Une table plutôt que quatre `if` recopiés : la longueur en tient deux, et
 * une garde transverse se nomme (CLAUDE.md §4).
 */
export const CHAMPS_LIBRES = [
  'minKm',
  'maxKm',
  'maxMinutes',
  'maxGain',
  'maxAwayKm',
] as const

export const CHAMPS_DU_PILOTE: Record<
  ChampPilote,
  readonly (typeof CHAMPS_LIBRES)[number][]
> = {
  longueur: ['minKm', 'maxKm'],
  duree: ['maxMinutes'],
  denivele: ['maxGain'],
  proximite: ['maxAwayKm'],
}

/** Ce qu'une question en langage naturel a posé sur un champ piloté, en mots. */
export function libelleQuestion(
  pose: Partial<DiscoveryFilters>,
  champ: ChampPilote,
): string | null {
  if (champ === 'longueur') {
    if (pose.minKm != null && pose.maxKm != null)
      return `${String(pose.minKm)} à ${String(pose.maxKm)} km`
    if (pose.maxKm != null) return `moins de ${String(pose.maxKm)} km`
    if (pose.minKm != null) return `plus de ${String(pose.minKm)} km`
    return null
  }
  if (champ === 'duree')
    return pose.maxMinutes == null
      ? null
      : `moins de ${String(pose.maxMinutes)} min`
  if (champ === 'denivele')
    return pose.maxGain == null ? null : `moins de ${String(pose.maxGain)} m`
  return pose.maxAwayKm == null
    ? null
    : `à moins de ${String(pose.maxAwayKm)} km`
}

/** Convertit la valeur d'un <select> d'index en index sûr. */
export function toIndex(value: string, length: number): number {
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 && index < length ? index : 0
}

/**
 * Lit une durée publiée (« 1h30 », « 3 h », « 45 min »). Retourne null pour
 * tout ce qui n'est pas sûrement interprétable : mieux vaut estimer que
 * afficher une durée fausse tirée d'un texte libre.
 */
export function parseMinutes(temps: string | null): number | null {
  if (!temps) return null
  const heures = /(\d{1,2})\s*[hH](?:\s*(\d{1,2}))?/.exec(temps)
  if (heures) {
    const h = Number(heures[1])
    const m = heures[2] === undefined ? 0 : Number(heures[2])
    if (m > 59) return null
    const total = h * 60 + m
    return total > 0 && total <= MAX_PUBLISHED_MINUTES ? total : null
  }
  const minutes = /(\d{1,3})\s*(?:min\b|mn\b|minutes?\b)/i.exec(temps)
  if (minutes) {
    const total = Number(minutes[1])
    return total > 0 ? total : null
  }
  return null
}

/** Lit un dénivelé publié (« 129 m », « 1 200 m »). */
export function parseElevationGain(denivele: string | null): number | null {
  if (!denivele) return null
  const trouve = /(\d[\d\s\u00a0]*)\s*m\b/i.exec(denivele)
  if (!trouve) return null
  const valeur = Number((trouve[1] ?? '').replace(/[\s\u00a0]/g, ''))
  return Number.isFinite(valeur) ? valeur : null
}

/**
 * Estimation de durée : marche à plat plus temps de montée. Volontairement
 * simple et arrondie au quart d'heure près — annoncer « 2 h 07 » donnerait
 * une fausse impression de précision sur une donnée qui n'en a pas.
 */
export function estimateMinutes(
  meters: number,
  gainMeters: number | null,
): number {
  if (meters <= 0) return 0
  const plat = (meters / 1_000 / FLAT_KMH) * 60
  const montee =
    gainMeters === null ? 0 : (gainMeters / ASCENT_METERS_PER_HOUR) * 60
  return Math.round(plat + montee)
}

function nodeKey(point: LonLat): string {
  const [lon, lat] = point
  return `${Math.round(lon / NODE_PRECISION_DEG)},${Math.round(lat / NODE_PRECISION_DEG)}`
}

/**
 * Forme du tracé, déduite des extrémités de tronçons : une extrémité vue un
 * nombre impair de fois est un bout libre. Zéro bout libre = circuit fermé ;
 * deux bouts libres = aller simple (ou boucle si les deux se frôlent) ;
 * au-delà, c'est un réseau ramifié — un GR avec ses variantes — et prétendre
 * trancher serait une invention.
 */
export function itineraryShape(
  ways: TrailWay[],
  toleranceMeters = LOOP_TOLERANCE_METERS,
): Shape {
  const degres = new Map<string, { count: number; point: LonLat }>()
  let tronconsUtiles = 0
  for (const way of ways) {
    const debut = way.coords[0]
    const fin = way.coords[way.coords.length - 1]
    if (!debut || !fin || way.coords.length < 2) continue
    tronconsUtiles += 1
    for (const extremite of [debut, fin]) {
      const cle = nodeKey(extremite)
      const existant = degres.get(cle)
      if (existant) existant.count += 1
      else degres.set(cle, { count: 1, point: extremite })
    }
  }
  if (tronconsUtiles === 0) return 'unknown'

  const libres = [...degres.values()].filter((n) => n.count % 2 === 1)
  if (libres.length === 0) return 'loop'
  if (libres.length !== 2) return 'unknown'
  const [a, b] = libres
  if (!a || !b) return 'unknown'
  return distanceMeters(a.point, b.point) <= toleranceMeters ? 'loop' : 'linear'
}

/**
 * Distance jusqu'au point le plus proche du tracé — pas jusqu'à son départ :
 * un GR qui passe au bout de la rue n'est pas « à 200 km » parce qu'il
 * commence en Alsace. Sur les longs itinéraires, la géométrie est éclaircie
 * pour rester sous quelques centaines de points ; la précision reste très
 * au-delà de ce qu'un filtre « à moins de 10 km » demande.
 */
export function distanceFromMeters(
  itinerary: Itinerary,
  from: LonLat,
): number | null {
  const total = itinerary.ways.reduce((n, w) => n + w.coords.length, 0)
  if (total === 0) return null
  const pas = Math.max(1, Math.ceil(total / PROXIMITY_MAX_POINTS))
  let min = Infinity
  for (const way of itinerary.ways) {
    let precedent: LonLat | null = null
    for (let i = 0; i < way.coords.length; i += pas) {
      const point = way.coords[i]
      if (!point) continue
      min = Math.min(
        min,
        precedent
          ? distanceToSegmentMeters(from, precedent, point)
          : distanceMeters(from, point),
      )
      precedent = point
    }
    // Le dernier point est toujours pris en compte : sinon la fin d'un long
    // tronçon serait ignorée par le pas d'échantillonnage.
    const dernier = way.coords[way.coords.length - 1]
    if (dernier && precedent) {
      min = Math.min(min, distanceToSegmentMeters(from, precedent, dernier))
    }
  }
  return Number.isFinite(min) ? min : null
}

/** Ce qu'on sait d'un itinéraire pour aider à le choisir. */
/**
 * `1 - 1e-9` et non `1` : les parts sont des divisions en virgule flottante,
 * et une somme de vingt tronçons peut retomber sur 0,9999999999999998. Sans
 * cette marge, un itinéraire entièrement bitumé serait écarté du filtre pour
 * une erreur d'arrondi — et le défaut serait invisible, puisqu'il ne
 * concernerait que certains itinéraires.
 */
const TOUT = 1 - 1e-9

function estEntierementRoulant(itinerary: Itinerary): boolean {
  const parts = partsDeRevetement(itinerary)
  return parts.dur + parts.stabilise >= TOUT
}

export function itineraryFacts(
  itinerary: Itinerary,
  from: LonLat | null = null,
): ItineraryFacts {
  const publiees = itinerary.details
  const gainMeters = parseElevationGain(publiees?.denivele ?? null)
  const minutesPubliees = parseMinutes(publiees?.temps ?? null)
  return {
    meters: itinerary.totalMeters,
    gainMeters,
    minutes: minutesPubliees ?? estimateMinutes(itinerary.totalMeters, gainMeters),
    minutesSource: minutesPubliees === null ? 'estimated' : 'published',
    shape: itineraryShape(itinerary.ways),
    awayMeters: from ? distanceFromMeters(itinerary, from) : null,
    entierementRoulant: estEntierementRoulant(itinerary),
  }
}

/** Un filtre ne s'applique jamais à une donnée absente (cf. en-tête). */
export function matchesFilters(
  facts: ItineraryFacts,
  filters: DiscoveryFilters,
): boolean {
  const km = facts.meters / 1_000
  if (filters.minKm !== null && km < filters.minKm) return false
  if (filters.maxKm !== null && km > filters.maxKm) return false
  if (
    filters.maxGain !== null &&
    facts.gainMeters !== null &&
    facts.gainMeters > filters.maxGain
  ) {
    return false
  }
  if (filters.maxMinutes !== null && facts.minutes > filters.maxMinutes) {
    return false
  }
  if (
    filters.maxAwayKm !== null &&
    facts.awayMeters !== null &&
    facts.awayMeters / 1_000 > filters.maxAwayKm
  ) {
    return false
  }
  if (filters.shape !== 'all' && facts.shape !== filters.shape) return false
  // La seule exception à la règle de l'en-tête, et elle est argumentée sur
  // le champ `sol` de `DiscoveryFilters` : ici, l'inconnu est écarté.
  if (filters.sol === 'roulant' && !facts.entierementRoulant) return false
  return true
}

/**
 * Qualifier l'effort, pour qui ne sait pas encore lire « 420 m D+ »
 * (issue #156).
 *
 * Un chiffre brut demande une expérience que celui qui débute n'a pas
 * encore : c'est le même reproche que celui fait au vocabulaire du premier
 * écran (#145), sous une autre forme.
 *
 * **Ce n'est pas une cotation.** Nous n'avons ni le droit ni la donnée d'une
 * cotation FFRandonnée — leurs barèmes sont éditoriaux et protégés, et ils
 * tiennent compte de la technicité du terrain, que nous ignorons
 * complètement. Le libellé le dit, et un test interdit les mots qui
 * laisseraient croire le contraire.
 *
 * ## D'où viennent les deux bornes
 *
 * Elles ne sont pas posées sur une difficulté, qui ne se mesure pas ici,
 * mais sur la **durée déjà calculée** par `estimateMinutes` — laquelle
 * repose sur 4 km/h à plat et 300 m de montée à l'heure, la règle de terrain
 * française usuelle, écrite plus haut dans ce fichier.
 *
 * Ce sont donc des paliers d'affichage : ils ne changent rien à ce qui est
 * calculé, seulement le mot posé dessus. CLAUDE.md §2 autorise à les
 * trancher au jugement, à condition de les écrire — voici les pistes :
 *
 * - **retenue** : deux bornes sur la durée, à 2 h 30 et 5 h. Ce sont des
 *   journées de marche — une matinée, une journée pleine, davantage — et
 *   c'est la seule unité que quelqu'un qui débute sait déjà interpréter,
 *   parce qu'elle ne parle pas de montagne mais d'emploi du temps ;
 * - **écartée** : un indice composite (distance + D+ / 100, le
 *   « kilomètre-effort »). Plus fin, mais il rend un nombre sans unité que
 *   personne ne sait lire — on remplacerait un chiffre opaque par un autre ;
 * - **écartée** : des bornes sur le seul dénivelé. C'est précisément le
 *   chiffre que l'issue reproche de servir brut.
 */
export const SEUIL_FACILE_MINUTES = 150
export const SEUIL_MOYEN_MINUTES = 300

type Effort = 'facile' | 'moyen' | 'soutenu'

export function effortEstime(facts: ItineraryFacts): Effort {
  if (facts.minutes <= SEUIL_FACILE_MINUTES) return 'facile'
  if (facts.minutes <= SEUIL_MOYEN_MINUTES) return 'moyen'
  return 'soutenu'
}

/**
 * Le libellé complet : la qualification, et ce sur quoi elle repose.
 *
 * Le cas qui décide de son honnêteté est celui du dénivelé absent. Sans lui,
 * l'estimation ne porte que sur la distance, et un sentier court et très
 * raide serait annoncé « facile ». Le dire est la seule façon de ne pas
 * tromper — et c'est la même règle que la fiche applique déjà à la
 * potabilité d'une source (#123) : ce qu'OpenStreetMap tait, on le tait
 * aussi, mais on dit qu'on le tait.
 */
export function libelleEffort(facts: ItineraryFacts): string {
  const heures = formatDuration(facts.minutes)
  const appui =
    facts.minutesSource === 'published'
      ? `${heures} annoncées par la source`
      : facts.gainMeters === null
        ? `${heures}, sur la distance seule — dénivelé non publié`
        : `${heures} à ${String(FLAT_KMH)} km/h, D+ compris`
  return `Effort estimé : ${effortEstime(facts)} (${appui})`
}
