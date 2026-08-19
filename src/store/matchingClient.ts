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
let nextRequestId = 1
const pending = new Map<number, (result: MatchResult) => void>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(
      new URL('../workers/matching.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event: MessageEvent<MatchResponse>) => {
      const resolve = pending.get(event.data.requestId)
      if (resolve) {
        pending.delete(event.data.requestId)
        resolve(event.data.result)
      }
    }
    worker.onerror = () => {
      // Worker cassé (CSP, build…) : on le neutralise, le prochain calcul
      // repassera en synchrone dans le thread principal.
      worker?.terminate()
      worker = null
      for (const [id, resolve] of pending) {
        pending.delete(id)
        resolve(null as unknown as MatchResult)
      }
    }
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
