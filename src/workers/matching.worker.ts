/// <reference lib="webworker" />
import { runMatching, type MatchResult } from '../core/matching.ts'
import type { Itinerary, LonLat } from '../core/types.ts'

export interface MatchRequest {
  requestId: number
  itineraries: Itinerary[]
  trackPoints: LonLat[]
  toleranceMeters: number
  stepMeters: number
  computedAt: string
}

export interface MatchResponse {
  requestId: number
  result: MatchResult
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<MatchRequest>) => {
  const { requestId, itineraries, trackPoints, toleranceMeters, stepMeters, computedAt } =
    event.data
  const result = runMatching(itineraries, trackPoints, {
    toleranceMeters,
    stepMeters,
    computedAt,
  })
  scope.postMessage({ requestId, result } satisfies MatchResponse)
}
