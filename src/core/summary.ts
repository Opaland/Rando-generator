import type { AggregateStats } from './matching.ts'
import { DEFAULT_COMPLETION_PCT, isCompleted } from './milestones.ts'
import type { CompletionResult, Itinerary, Track } from './types.ts'

/**
 * Bilan partageable : le chiffre qu'on a envie de montrer.
 *
 * « 61 % du tour du Pilat » se raconte ; « vous avez utilisé l'application »
 * non. Tout est calculé ici, en clair, pour que l'image produite plus tard
 * ne contienne rien d'autre que ce que l'utilisateur voit à l'écran — et
 * surtout : pas une seule coordonnée de ses traces.
 */

/** Au-delà, l'image devient un tableau qu'on ne lit plus. */
const TOP_MAX = 5

export interface SummaryLine {
  name: string
  pct: number
  completed: boolean
}

export interface Summary {
  pct: number
  doneMeters: number
  totalMeters: number
  /** Nombre de traces importées, datées ou non. */
  outings: number
  /** Première et dernière sortie datée (AAAA-MM-JJ), si elles existent. */
  period: { from: string; to: string } | null
  top: SummaryLine[]
  zoneLabel: string | null
}

export interface SummaryInput {
  global: AggregateStats
  results: CompletionResult[]
  itineraries: Itinerary[]
  tracks: Track[]
  zoneLabel?: string | null
  /** Seuil « bouclé » retenu par l'utilisateur (défaut : celui du module). */
  completionPct?: number
}

function isoDay(date: string | null): string | null {
  if (!date) return null
  const time = Date.parse(date)
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10)
}

export function buildSummary(input: SummaryInput): Summary {
  const {
    global,
    results,
    itineraries,
    tracks,
    zoneLabel = null,
    completionPct = DEFAULT_COMPLETION_PCT,
  } = input
  const nameById = new Map(
    itineraries.map((i) => [
      i.osmRelationId,
      i.ref ?? i.name ?? `Itinéraire ${i.osmRelationId}`,
    ]),
  )

  const top = results
    // Un itinéraire jamais foulé n'a rien à faire dans un bilan de sortie.
    .filter((r) => r.pct > 0 && nameById.has(r.itineraryId))
    .sort((a, b) => b.pct - a.pct || b.doneMeters - a.doneMeters)
    .slice(0, TOP_MAX)
    .map((r) => ({
      name: nameById.get(r.itineraryId) ?? '',
      pct: r.pct,
      completed: isCompleted(r.pct, completionPct),
    }))

  const jours = tracks.map((t) => isoDay(t.date)).filter((j) => j !== null)
  jours.sort()
  const premier = jours[0]
  const dernier = jours[jours.length - 1]

  return {
    pct: global.pct,
    doneMeters: global.doneMeters,
    totalMeters: global.totalMeters,
    outings: tracks.length,
    period: premier && dernier ? { from: premier, to: dernier } : null,
    top,
    zoneLabel,
  }
}

/** Nom du fichier téléchargé, daté du jour de génération. */
export function summaryFilename(isoNow: string): string {
  const jour = isoDay(isoNow)
  return jour ? `bilan-sentiers-${jour}.png` : 'bilan-sentiers.png'
}
