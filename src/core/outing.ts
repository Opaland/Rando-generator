import type { CompletionResult, Itinerary, Track } from './types.ts'

/**
 * Ce qu'une sortie a apporté.
 *
 * Le tableau de bord répond à « où en suis-je ? » ; une trace, elle, répond
 * à « qu'est-ce que j'ai fait ce jour-là ? ». C'est la même donnée regardée
 * par l'autre bout, et c'est celle dont on se souvient.
 */

/**
 * En dessous, ce n'est pas un parcours mais un croisement : traverser un GR
 * perpendiculairement en crédite quelques dizaines de mètres, et annoncer
 * « vous avez parcouru le GR 65 » serait faux.
 */
export const MIN_OUTING_METERS = 300

/** Au-delà, la fiche d'une trace devient une liste. */
const DEFAULT_LIMIT = 5

export interface OutingHighlight {
  itineraryId: number
  name: string
  doneMeters: number
  pct: number
}

export interface OutingOptions {
  limit?: number
  minMeters?: number
}

export function outingHighlights(
  results: CompletionResult[],
  itineraries: Itinerary[],
  options: OutingOptions = {},
): OutingHighlight[] {
  const limit = options.limit ?? DEFAULT_LIMIT
  const minMeters = options.minMeters ?? MIN_OUTING_METERS
  const nameById = new Map(
    itineraries.map((i) => [
      i.osmRelationId,
      i.ref ?? i.name ?? `Itinéraire ${i.osmRelationId}`,
    ]),
  )
  return results
    .filter((r) => r.doneMeters >= minMeters && nameById.has(r.itineraryId))
    .sort((a, b) => b.doneMeters - a.doneMeters)
    .slice(0, limit)
    .map((r) => ({
      itineraryId: r.itineraryId,
      name: nameById.get(r.itineraryId) ?? '',
      doneMeters: r.doneMeters,
      pct: r.pct,
    }))
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « Le 15 juin 2024 », ou l'aveu qu'on ne sait pas. */
export function outingLabel(track: Track): string {
  if (!track.date) return 'Sortie sans date'
  const temps = Date.parse(track.date)
  if (Number.isNaN(temps)) return 'Sortie sans date'
  return `Le ${DATE_FORMAT.format(new Date(temps))}`
}
