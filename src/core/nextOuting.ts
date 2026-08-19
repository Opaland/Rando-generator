import { distanceMeters } from './geo.ts'
import type { Itinerary, LonLat, Sample } from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * « Prochaine sortie » : répondre à la question qui vient juste après le
 * pourcentage — *par où continuer ?*
 *
 * Un tableau de bord qui affiche 43 % laisse l'utilisateur devant une carte
 * et cinquante itinéraires entamés. On cherche donc le plus long tronçon
 * encore non parcouru, pondéré par la distance qu'il faut faire pour aller
 * s'y rendre : un tronçon de 12 km à 200 km de chez soi n'est pas une
 * proposition, c'est un voyage.
 */

/**
 * Distance d'approche à laquelle un gain compte pour moitié. C'est un choix
 * explicite, pas une constante magique : au-delà, une sortie se prépare.
 */
export const APPROACH_HALF_LIFE_KM = 10

/** Tronçon d'un itinéraire resté non parcouru, d'un seul tenant. */
export interface UnwalkedRun {
  wayId: number
  meters: number
  /** Premier point non parcouru : c'est là qu'on reprend. */
  start: LonLat
}

export interface Suggestion {
  itineraryId: number
  /** Tout ce qui reste à parcourir sur cet itinéraire. */
  remainingMeters: number
  /** Le plus long tronçon d'un seul tenant — ce qu'on va effectivement faire. */
  bestRun: UnwalkedRun
  /** Distance jusqu'au départ du tronçon, si la position est connue. */
  awayMeters: number | null
  score: number
}

export interface NextOutingOptions {
  from?: LonLat | null
  limit?: number
  stepMeters?: number
}

interface Accumulateur {
  remainingSamples: number
  best: { wayId: number; samples: number; start: LonLat } | null
  courant: { wayId: number; samples: number; start: LonLat } | null
}

function cloturer(acc: Accumulateur): void {
  const { courant } = acc
  if (!courant) return
  if (!acc.best || courant.samples > acc.best.samples) acc.best = courant
  acc.courant = null
}

/**
 * Classe les itinéraires entamés par intérêt de la prochaine sortie.
 * Les échantillons sont parcourus une seule fois : un chemin partagé par
 * plusieurs itinéraires compte pour chacun d'eux.
 */
export function suggestNextOutings(
  itineraries: Itinerary[],
  samples: Sample[],
  options: NextOutingOptions = {},
): Suggestion[] {
  const { from = null, limit = 3, stepMeters = STEP_METERS } = options
  const connus = new Set(itineraries.map((i) => i.osmRelationId))
  const parItineraire = new Map<number, Accumulateur>()

  for (const sample of samples) {
    for (const id of sample.itineraryIds) {
      if (!connus.has(id)) continue
      let acc = parItineraire.get(id)
      if (!acc) {
        acc = { remainingSamples: 0, best: null, courant: null }
        parItineraire.set(id, acc)
      }
      // Un tronçon s'interrompt dès qu'un échantillon est parcouru, et au
      // changement de chemin : deux ways distincts ne se suivent pas
      // forcément sur le terrain, les recoller inventerait un tronçon.
      if (sample.done || acc.courant?.wayId !== sample.wayId) cloturer(acc)
      if (sample.done) continue
      acc.remainingSamples += 1
      if (acc.courant) acc.courant.samples += 1
      else {
        acc.courant = {
          wayId: sample.wayId,
          samples: 1,
          start: [sample.lon, sample.lat],
        }
      }
    }
  }

  const suggestions: Suggestion[] = []
  for (const [itineraryId, acc] of parItineraire) {
    cloturer(acc)
    const best = acc.best
    if (!best) continue
    const meters = best.samples * stepMeters
    const awayMeters = from ? distanceMeters(from, best.start) : null
    const penalite =
      awayMeters === null ? 1 : 1 + awayMeters / 1_000 / APPROACH_HALF_LIFE_KM
    suggestions.push({
      itineraryId,
      remainingMeters: acc.remainingSamples * stepMeters,
      bestRun: { wayId: best.wayId, meters, start: best.start },
      awayMeters,
      score: meters / penalite,
    })
  }

  return suggestions
    .sort((a, b) => b.score - a.score || a.itineraryId - b.itineraryId)
    .slice(0, Math.max(0, limit))
}
