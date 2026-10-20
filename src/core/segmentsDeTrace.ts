import type { LonLat, Track } from './types.ts'

/**
 * Les tronçons d'une trace, et ce qu'on n'a pas marché entre eux (#560).
 *
 * Une sortie avec une pause était rangée comme une seule ligne : le trajet
 * fait pendant la pause se comptait dans l'historique, se dessinait sur la
 * carte, partait dans l'export GPX. `Track.debutsDeSegment` dit où commence
 * chaque tronçon ; tout ce qui lit une trace passe par ici pour le savoir,
 * plutôt que de relire le champ à sa façon (§4).
 */

/**
 * Les indices où commence un nouveau tronçon, assainis.
 *
 * Une sauvegarde modifiée à la main peut porter n'importe quoi :
 * `core/backup.ts` ne revalide que les points. Une coupure à 0, au-delà de
 * la fin, en double ou non entière est écartée plutôt que d'inventer un
 * tronçon vide.
 */
function coupuresDe(trace: Pick<Track, 'points' | 'debutsDeSegment'>): number[] {
  const n = trace.points.length
  return [...new Set(trace.debutsDeSegment ?? [])]
    .filter((i) => Number.isInteger(i) && i > 0 && i < n)
    .sort((a, b) => a - b)
}

/**
 * Les tranches `[début, fin)` de chaque tronçon. Exportée pour l'export
 * GPX, qui découpe des `<trkpt>` déjà écrits et non des coordonnées.
 */
export function tranchesDe(
  trace: Pick<Track, 'points' | 'debutsDeSegment'>,
): [number, number][] {
  const bornes = [0, ...coupuresDe(trace), trace.points.length]
  return bornes.slice(1).map((fin, k) => [bornes[k] ?? 0, fin])
}

/** Les tronçons marchés, chacun d'un seul tenant. */
export function segmentsDe(
  trace: Pick<Track, 'points' | 'debutsDeSegment'>,
): LonLat[][] {
  return tranchesDe(trace).map(([debut, fin]) => trace.points.slice(debut, fin))
}

/**
 * Met les traces bout à bout pour l'appariement, qui n'en prend qu'une.
 *
 * `coupures` liste les indices `i` où le pas `i − 1 → i` n'a pas été
 * marché : chaque début de tronçon, **et chaque jonction entre deux
 * traces**. Sans la seconde, la fin d'une sortie et le début de la
 * suivante, posés à quelques centaines de mètres, se reliaient, et le
 * sentier entre les deux était crédité — `flatMap` ne disait pas où une
 * trace finissait.
 */
export function assemblerPourLAppariement(tracks: readonly Track[]): {
  trackPoints: LonLat[]
  trackTimes: (number | null)[]
  coupures: number[]
} {
  const trackPoints: LonLat[] = []
  // Même longueur et alignement que trackPoints : une trace sans
  // horodatage (#149) contribue des `null`, pas un décalage.
  const trackTimes: (number | null)[] = []
  const coupures: number[] = []
  for (const track of tracks) {
    const debut = trackPoints.length
    if (debut > 0 && track.points.length > 0) coupures.push(debut)
    for (const i of coupuresDe(track)) coupures.push(debut + i)
    trackPoints.push(...track.points)
    trackTimes.push(...(track.times ?? track.points.map(() => null)))
  }
  return { trackPoints, trackTimes, coupures }
}
