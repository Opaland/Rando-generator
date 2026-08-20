import type { CompletionResult } from './types.ts'

/**
 * Jalons de complétion.
 *
 * Un pourcentage qui monte lentement ne dit pas grand-chose ; un palier
 * franchi, si. Les jalons donnent des étapes intermédiaires, et le seuil de
 * « bouclé » évite de punir l'utilisateur pour ce qui ne dépend pas de lui.
 */

/** Paliers affichés — assez espacés pour rester des événements. */
export const MILESTONES: readonly number[] = [25, 50, 75, 90, 100]

/**
 * Seuil à partir duquel un itinéraire est considéré comme bouclé.
 *
 * Règle empruntée à CityStrides : exiger 100 % punit l'utilisateur pour des
 * tronçons impraticables, des déviations de balisage ou une géométrie OSM
 * imparfaite — aucun de ces trois n'est de son fait. Le seuil est toujours
 * annoncé tel quel dans l'interface : « bouclé » n'est jamais présenté
 * comme du 100 %.
 */
export const COMPLETION_PCT = 95

/** Dernier jalon franchi, ou null si le premier n'est pas encore atteint. */
export function reachedMilestone(pct: number): number | null {
  let atteint: number | null = null
  for (const jalon of MILESTONES) if (pct >= jalon) atteint = jalon
  return atteint
}

/** Prochain jalon à viser, ou null une fois au bout. */
export function nextMilestone(pct: number): number | null {
  return MILESTONES.find((jalon) => pct < jalon) ?? null
}

/** Mètres restants avant le prochain jalon, si la longueur est connue. */
export function metersToNextMilestone(
  pct: number,
  totalMeters: number,
): number | null {
  const jalon = nextMilestone(pct)
  if (jalon === null || totalMeters <= 0) return null
  return ((jalon - pct) / 100) * totalMeters
}

export function isCompleted(pct: number): boolean {
  return pct >= COMPLETION_PCT
}

export interface MilestoneCrossing {
  itineraryId: number
  milestone: number
}

/**
 * Jalons franchis entre deux calculs.
 *
 * Deux règles de prudence, parce qu'une fausse annonce vaut moins que pas
 * d'annonce du tout :
 * - **rien au premier calcul** : au chargement d'une zone, tout paraîtrait
 *   « franchi » alors qu'on découvre simplement l'état ;
 * - **un seul jalon par itinéraire**, le plus haut : importer une saison de
 *   traces d'un coup ne doit pas déclencher quatre annonces pour le même GR.
 */
export function crossedMilestones(
  previousPcts: ReadonlyMap<number, number>,
  results: CompletionResult[],
): MilestoneCrossing[] {
  const franchis: MilestoneCrossing[] = []
  for (const result of results) {
    const avant = previousPcts.get(result.itineraryId)
    if (avant === undefined) continue
    const jalonAvant = reachedMilestone(avant)
    const jalonApres = reachedMilestone(result.pct)
    if (jalonApres === null) continue
    if (jalonAvant !== null && jalonApres <= jalonAvant) continue
    franchis.push({ itineraryId: result.itineraryId, milestone: jalonApres })
  }
  return franchis.sort(
    (a, b) => b.milestone - a.milestone || a.itineraryId - b.itineraryId,
  )
}
