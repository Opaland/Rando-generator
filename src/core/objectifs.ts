import type { Itinerary, LonLat, Sample } from './types.ts'
import { STEP_METERS } from './types.ts'

/**
 * Mode « objectif » (issue #13).
 *
 * Le tableau de bord constate ; il ne motive pas. « 43 % » laisse
 * l'utilisateur devant une carte et cinquante itinéraires entamés. Épingler
 * un itinéraire, c'est répondre à la seule question qui reste : *qu'est-ce
 * qu'il me manque, et où ?*
 *
 * On ne calcule rien de neuf — les échantillons du matching portent déjà
 * l'information. On la regroupe en tronçons continus, parce qu'un tronçon
 * est ce qu'on va effectivement marcher, là où un pourcentage ne se marche
 * pas.
 */

/**
 * Nombre de tronçons rendus. Un GR de 800 km entamé par morceaux en produit
 * des centaines : la liste deviendrait le problème qu'elle prétend résoudre.
 * Les plus longs d'abord — ce sont ceux qui font avancer.
 */
export const MAX_TRONCONS = 8

export interface TronconRestant {
  wayId: number
  meters: number
  /** Premier point non parcouru : c'est là qu'on se gare. */
  start: LonLat
  /** Dernier point non parcouru : c'est là qu'on ressort. */
  end: LonLat
}

export interface ResumeObjectif {
  itineraryId: number
  doneMeters: number
  remainingMeters: number
  pct: number
  troncons: TronconRestant[]
}

/**
 * Tronçons restant à parcourir sur un itinéraire, du plus long au plus court.
 *
 * Deux tronçons de *ways* différents ne sont jamais recollés, même s'ils se
 * suivent dans la liste : les recoller promettrait une continuité que la
 * géométrie ne garantit pas.
 */
export function tronconsRestants(
  itinerary: Itinerary,
  samples: Sample[],
  stepMeters: number = STEP_METERS,
): TronconRestant[] {
  const id = itinerary.osmRelationId
  const troncons: TronconRestant[] = []
  let courant: TronconRestant | null = null

  const cloturer = () => {
    if (courant) troncons.push(courant)
    courant = null
  }

  for (const sample of samples) {
    if (!sample.itineraryIds.includes(id)) continue
    if (sample.done) {
      cloturer()
      continue
    }
    const point: LonLat = [sample.lon, sample.lat]
    if (courant && courant.wayId === sample.wayId) {
      courant.meters += stepMeters
      courant.end = point
    } else {
      cloturer()
      courant = { wayId: sample.wayId, meters: stepMeters, start: point, end: point }
    }
  }
  cloturer()

  return troncons.sort((a, b) => b.meters - a.meters).slice(0, MAX_TRONCONS)
}

/** Ce qu'il reste sur un objectif : des mètres, un pourcentage, des tronçons. */
export function resumeObjectif(
  itinerary: Itinerary,
  samples: Sample[],
  stepMeters: number = STEP_METERS,
): ResumeObjectif {
  const miens = samples.filter((s) =>
    s.itineraryIds.includes(itinerary.osmRelationId),
  )
  const faits = miens.filter((s) => s.done).length
  const total = miens.length
  return {
    itineraryId: itinerary.osmRelationId,
    doneMeters: faits * stepMeters,
    remainingMeters: (total - faits) * stepMeters,
    // Sans échantillon, il n'y a pas de progression à annoncer — surtout pas
    // un « NaN % » né d'une division par zéro.
    pct: total === 0 ? 0 : (faits / total) * 100,
    troncons: tronconsRestants(itinerary, samples, stepMeters),
  }
}
