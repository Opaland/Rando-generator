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

/** Ce qu'il faut pour qu'une barre se lise : le sommet, et son échelle. */
export interface ReperesHistogramme {
  /** Le mois le plus haut, ou `null` si aucun mois ne porte de sortie. */
  moisLePlusHaut: string | null
  /** Sa distance, en mètres. Zéro quand il n'y a rien à désigner. */
  metresLePlusHaut: number
  /** Combien de mois portent au moins une sortie. */
  moisRenseignes: number
}

/**
 * Les repères que l'histogramme de « Mes sorties » doit annoncer par écrit.
 *
 * Retour de Cédric, 04/09 : « j'ai une barre rouge qui apparaît, je ne sais
 * pas ce que ça veut dire. Est-ce que c'est la distance ? Est-ce que c'est
 * des tours ? » Le seul texte qui l'expliquait était un `aria-label` — et un
 * `aria-label` n'est pas peint. Pour qui regarde l'écran, il n'existe pas.
 *
 * Sans échelle, une barre ne dit rien non plus : haute ou basse, on ne sait
 * pas si elle vaut trois kilomètres ou trois cents. D'où le sommet chiffré
 * plutôt qu'un axe gradué — écarté délibérément, parce que l'histogramme fait
 * 70 px de haut et que des graduations lisibles y prendraient plus de place
 * que les barres elles-mêmes, sous le plancher typographique du dépôt.
 *
 * Les mois creux sont ignorés ici alors que `monthlyBuckets` les conserve :
 * là-bas ils montrent l'interruption, ce qui est une information ; ici ils
 * ne peuvent pas être le sommet, et les compter comme « renseignés » ferait
 * annoncer douze mois de pratique à qui n'en a qu'un.
 */
export function reperesHistogramme(
  buckets: MonthBucket[],
): ReperesHistogramme {
  const avecSortie = buckets.filter((bucket) => bucket.count > 0)
  let moisLePlusHaut: string | null = null
  let metresLePlusHaut = 0
  for (const bucket of avecSortie) {
    if (moisLePlusHaut === null || bucket.distanceMeters > metresLePlusHaut) {
      moisLePlusHaut = bucket.month
      metresLePlusHaut = bucket.distanceMeters
    }
  }
  return {
    moisLePlusHaut,
    metresLePlusHaut,
    moisRenseignes: avecSortie.length,
  }
}
