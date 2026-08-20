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
 * Seuils proposés pour considérer un itinéraire comme bouclé.
 *
 * Règle empruntée à CityStrides : exiger 100 % punit l'utilisateur pour des
 * tronçons impraticables, des déviations de balisage ou une géométrie OSM
 * imparfaite — aucun de ces trois n'est de son fait. Mais l'inverse est vrai
 * aussi : certains veulent la satisfaction du 100 % exact, et le leur refuser
 * serait tout aussi arbitraire. Trois seuils, donc, et le choix revient à
 * celui qui marche.
 *
 * Quel que soit le seuil retenu, il est toujours annoncé tel quel dans
 * l'interface : « bouclé » ne doit jamais devenir un mot dont le sens dépend
 * d'un réglage caché.
 */
export const COMPLETION_CHOICES: readonly number[] = [90, 95, 100]

export const DEFAULT_COMPLETION_PCT = 95

/** Ancien nom, conservé pour les appels qui n'ont pas à connaître le réglage. */
export const COMPLETION_PCT = DEFAULT_COMPLETION_PCT

/**
 * Ramène une valeur quelconque à l'un des seuils proposés.
 *
 * Le réglage vient d'IndexedDB, où il a pu être écrit par une version
 * antérieure — ou à la main. Mieux vaut le plus proche seuil connu qu'un
 * comportement inventé à partir d'une valeur arbitraire.
 */
export function normalizeCompletionPct(valeur: unknown): number {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    return DEFAULT_COMPLETION_PCT
  }
  let plusProche = DEFAULT_COMPLETION_PCT
  let ecart = Number.POSITIVE_INFINITY
  for (const choix of COMPLETION_CHOICES) {
    const distance = Math.abs(choix - valeur)
    if (distance < ecart) {
      ecart = distance
      plusProche = choix
    }
  }
  return plusProche
}

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

export function isCompleted(
  pct: number,
  seuil: number = DEFAULT_COMPLETION_PCT,
): boolean {
  return pct >= seuil
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

/**
 * Vrai tant que le franchissement annoncé reste vrai.
 *
 * L'annonce ne doit ni s'effacer toute seule — un recalcul de fond, déclenché
 * par le démarrage ou par l'arrivée de données, la faisait disparaître dans la
 * seconde — ni survivre à ce qu'elle raconte : une trace supprimée ou une
 * tolérance resserrée peut ramener l'itinéraire sous son jalon.
 */
export function franchissementTientEncore(
  annonce: MilestoneCrossing,
  results: CompletionResult[],
): boolean {
  const resultat = results.find((r) => r.itineraryId === annonce.itineraryId)
  if (!resultat) return false
  const jalon = reachedMilestone(resultat.pct)
  return jalon !== null && jalon >= annonce.milestone
}
