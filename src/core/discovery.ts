import { formatDuration } from '../lib/format.ts'
import { distanceMeters, distanceToSegmentMeters } from './geo.ts'
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
export const FLAT_KMH = 4

/** Montée avalée en une heure (m) — règle de terrain française usuelle. */
export const ASCENT_METERS_PER_HOUR = 300

/** Au-delà, la durée publiée est une coquille de saisie, pas une donnée. */
const MAX_PUBLISHED_MINUTES = 24 * 60

/**
 * Deux extrémités distantes de moins de cela sont « le même endroit » : un
 * parking, une place de village. Un circuit qui y revient est une boucle.
 */
export const LOOP_TOLERANCE_METERS = 150

/** Précision de regroupement des extrémités de tronçons (~1 m). */
const NODE_PRECISION_DEG = 1e-5

/** Au plus ce nombre de points par itinéraire pour mesurer une proximité. */
const PROXIMITY_MAX_POINTS = 200

/** Forme du tracé. `unknown` : réseau ramifié ou géométrie insuffisante. */
export type Shape = 'loop' | 'linear' | 'unknown'

export interface ItineraryFacts {
  meters: number
  /** D+ publié par la source, jamais deviné. */
  gainMeters: number | null
  minutes: number
  minutesSource: 'published' | 'estimated'
  shape: Shape
  /** Distance jusqu'au point le plus proche du tracé, si la position est connue. */
  awayMeters: number | null
}

export interface DiscoveryFilters {
  minKm: number | null
  maxKm: number | null
  maxGain: number | null
  maxMinutes: number | null
  maxAwayKm: number | null
  shape: 'all' | 'loop' | 'linear'
}

/** Aucun filtre actif : tout passe. */
export const ALL_FILTERS: DiscoveryFilters = {
  minKm: null,
  maxKm: null,
  maxGain: null,
  maxMinutes: null,
  maxAwayKm: null,
  shape: 'all',
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

export type Effort = 'facile' | 'moyen' | 'soutenu'

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
