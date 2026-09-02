import { runMatching, type MatchResult } from '../core/matching.ts'
import type { Itinerary, LonLat } from '../core/types.ts'
import type { MatchRequest, MatchResponse } from '../workers/matching.worker.ts'

export interface MatchingInput {
  itineraries: Itinerary[]
  trackPoints: LonLat[]
  toleranceMeters: number
  stepMeters: number
  computedAt: string
}

let worker: Worker | null = null
/**
 * Vrai dès qu'une tentative a échoué. Sans lui, `worker = null` invitait le
 * calcul suivant à en reconstruire un : mesuré à deux constructions pour deux
 * calculs alors que le commentaire d'à côté promettait une neutralisation
 * (#471). Les causes possibles — une CSP sans `worker-src`, un build qui n'a
 * pas produit le fichier, un navigateur sans workers de module — sont toutes
 * permanentes. Réessayer à chaque calcul ne coûterait donc qu'une
 * construction et un aller-retour perdus, à chaque changement de tolérance.
 *
 * Écarté : garder la reconstruction pour survivre à une panne passagère. Le
 * résultat serait le même dans les deux cas, le calcul synchrone rendant
 * exactement ce que rend le worker ; seule la fluidité de l'interface change,
 * et aucune des causes connues ne se répare toute seule.
 */
let workerImpossible = false
let nextRequestId = 1
const pending = new Map<number, (result: MatchResult | null) => void>()

/** Neutralise le worker pour de bon et libère les calculs qui l'attendaient. */
function abandonnerLeWorker(): void {
  workerImpossible = true
  worker?.terminate()
  worker = null
  for (const [id, resolve] of pending) {
    pending.delete(id)
    resolve(null)
  }
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined' || workerImpossible) return null
  if (!worker) {
    try {
      worker = new Worker(
        new URL('../workers/matching.worker.ts', import.meta.url),
        { type: 'module' },
      )
    } catch {
      // Une CSP qui n'autorise pas les workers fait jeter le constructeur, de
      // façon synchrone. Sans ce `catch`, `computeMatching` rejetait et
      // `recompute` laissait `matchingBusy` levé pour toujours : l'application
      // restait sur « calcul en cours » sans jamais rien afficher (#471).
      abandonnerLeWorker()
      return null
    }
    worker.onmessage = (event: MessageEvent<MatchResponse>) => {
      const resolve = pending.get(event.data.requestId)
      if (resolve) {
        pending.delete(event.data.requestId)
        resolve(event.data.result)
      }
    }
    // Worker cassé après coup : on l'abandonne, et ce calcul comme les
    // suivants se font en synchrone dans le thread principal.
    worker.onerror = abandonnerLeWorker
  }
  return worker
}

/**
 * Lance le matching dans un Web Worker pour garder l'UI fluide ; repli
 * synchrone si les workers sont indisponibles.
 */
export async function computeMatching(
  input: MatchingInput,
): Promise<MatchResult> {
  const w = getWorker()
  if (w) {
    const result = await new Promise<MatchResult | null>((resolve) => {
      const requestId = nextRequestId++
      pending.set(requestId, resolve)
      w.postMessage({ requestId, ...input } satisfies MatchRequest)
    })
    if (result) return result
  }
  return runMatching(input.itineraries, input.trackPoints, {
    toleranceMeters: input.toleranceMeters,
    stepMeters: input.stepMeters,
    computedAt: input.computedAt,
  })
}
