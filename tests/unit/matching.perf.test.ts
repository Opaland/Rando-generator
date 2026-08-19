import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import {
  straightLine,
  makeItinerary,
  metersToDegLat,
} from '../fixtures/synthetic.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

// Cible produit : 50 000 échantillons × 100 000 points GPX en moins de 2 s.
describe('runMatching — performance', () => {
  it('matche 50 000 échantillons contre 100 000 points GPX en < 2 s', () => {
    const LAT = 45
    // 50 ways de 100 km (1 001 échantillons chacun à STEP = 100 m),
    // espacés de 1 km en latitude → ~50 050 échantillons.
    const itineraries: Itinerary[] = []
    for (let w = 0; w < 50; w++) {
      const lat = LAT + metersToDegLat(w * 1000)
      const line = straightLine(4, lat, 100_000, 100)
      itineraries.push(
        makeItinerary(w + 1, [{ osmWayId: 100 + w, coords: line }]),
      )
    }

    // 100 000 points GPX : 25 lignes couvertes avec un point tous les 25 m.
    const trackPoints: LonLat[] = []
    for (let w = 0; w < 25; w++) {
      const lat = LAT + metersToDegLat(w * 1000)
      trackPoints.push(...straightLine(4, lat, 100_000, 25))
    }
    expect(trackPoints.length).toBeGreaterThanOrEqual(100_000)

    const t0 = performance.now()
    const { results, samples } = runMatching(itineraries, trackPoints, {
      toleranceMeters: 50,
      stepMeters: 100,
      computedAt: '2026-02-01T12:00:00Z',
    })
    const elapsed = performance.now() - t0

    expect(samples.length).toBeGreaterThanOrEqual(50_000)
    // Les 25 premières lignes sont faites, les 25 suivantes non.
    expect(results.filter((r) => r.pct === 100)).toHaveLength(25)
    expect(results.filter((r) => r.pct === 0)).toHaveLength(25)
    expect(elapsed).toBeLessThan(2000)
  }, 30_000)
})
