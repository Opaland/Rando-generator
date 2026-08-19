import { polylineLengthMeters } from './sampling.ts'
import type { Track } from './types.ts'

/**
 * Historique des sorties : les traces GPX portent une date que rien
 * n'exploitait. Regrouper par mois donne la seule chose qu'un compteur de
 * complétion ne montre pas — le rythme, et les mois où l'on n'est pas sorti.
 *
 * Les mois sont calculés en UTC : sinon la même trace changerait de mois
 * selon le fuseau où l'on ouvre l'application.
 */

export interface MonthBucket {
  /** Mois au format « 2026-08 ». */
  month: string
  count: number
  distanceMeters: number
  elevationGain: number
}

export interface HistoryStats {
  count: number
  distanceMeters: number
  elevationGain: number
  /** Sorties sans date exploitable : comptées dans les totaux, pas dans les mois. */
  undatedCount: number
  firstDate: string | null
  lastDate: string | null
}

/** Longueur d'une trace, en mètres. */
export function trackDistanceMeters(track: Track): number {
  return polylineLengthMeters(track.points)
}

/** Mois UTC « AAAA-MM » d'une date ISO, ou null si elle est illisible. */
function monthOf(date: string | null): string | null {
  if (!date) return null
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  const mois = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  return `${parsed.getUTCFullYear()}-${mois}`
}

/** Totaux de l'ensemble des sorties. */
export function historyStats(tracks: Track[]): HistoryStats {
  let distanceMeters = 0
  let elevationGain = 0
  let undatedCount = 0
  let first: { iso: string; time: number } | null = null
  let last: { iso: string; time: number } | null = null

  for (const track of tracks) {
    distanceMeters += trackDistanceMeters(track)
    // Un dénivelé absent (GPX sans altitudes) n'est pas un dénivelé nul :
    // il ne s'ajoute simplement pas au total.
    if (typeof track.elevationGain === 'number') {
      elevationGain += track.elevationGain
    }
    const time = track.date ? new Date(track.date).getTime() : Number.NaN
    if (Number.isNaN(time)) {
      undatedCount += 1
      continue
    }
    const iso = track.date as string
    if (!first || time < first.time) first = { iso, time }
    if (!last || time > last.time) last = { iso, time }
  }

  return {
    count: tracks.length,
    distanceMeters,
    elevationGain,
    undatedCount,
    firstDate: first?.iso ?? null,
    lastDate: last?.iso ?? null,
  }
}

/** Mois suivant, au format « AAAA-MM ». */
function nextMonth(month: string): string {
  const [annee, mois] = month.split('-').map(Number) as [number, number]
  return mois === 12
    ? `${annee + 1}-01`
    : `${annee}-${String(mois + 1).padStart(2, '0')}`
}

/**
 * Sorties regroupées par mois, du plus ancien au plus récent. Les mois sans
 * sortie sont conservés à zéro : une interruption de pratique est une
 * information, pas un détail à masquer.
 */
export function monthlyBuckets(tracks: Track[]): MonthBucket[] {
  const parMois = new Map<string, MonthBucket>()
  for (const track of tracks) {
    const month = monthOf(track.date)
    if (!month) continue
    const bucket = parMois.get(month) ?? {
      month,
      count: 0,
      distanceMeters: 0,
      elevationGain: 0,
    }
    bucket.count += 1
    bucket.distanceMeters += trackDistanceMeters(track)
    if (typeof track.elevationGain === 'number') {
      bucket.elevationGain += track.elevationGain
    }
    parMois.set(month, bucket)
  }
  if (parMois.size === 0) return []

  const mois = [...parMois.keys()].sort()
  const premier = mois[0] as string
  const dernier = mois[mois.length - 1] as string

  const complet: MonthBucket[] = []
  let courant = premier
  for (;;) {
    complet.push(
      parMois.get(courant) ?? {
        month: courant,
        count: 0,
        distanceMeters: 0,
        elevationGain: 0,
      },
    )
    if (courant === dernier) break
    courant = nextMonth(courant)
  }
  return complet
}

/** Distances cumulées mois après mois. */
export function cumulativeDistances(buckets: MonthBucket[]): number[] {
  let total = 0
  return buckets.map((bucket) => {
    total += bucket.distanceMeters
    return total
  })
}

const MOIS_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** « 2026-08 » → « août 2026 ». Retourne la valeur brute si elle est inattendue. */
export function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month
  const date = new Date(`${month}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return month
  return MOIS_FORMAT.format(date)
}
