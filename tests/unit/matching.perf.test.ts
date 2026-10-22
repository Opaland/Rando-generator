import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import {
  straightLine,
  makeItinerary,
  metersToDegLat,
} from '../fixtures/synthetic.ts'
import { distanceMeters } from '../../src/core/geo.ts'
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

/**
 * Trouvaille #539 (17/10) : `deposerLeResultatDeLImport` recalcule la
 * correspondance une fois pour tout le lot importé, `trackPoints` et
 * `trackTimes` étant simplement la concaténation de chaque activité. Si
 * l'horodatage de chaque activité repart plus tôt que la fin de la
 * précédente — observé sur une fixture de banc, mais rien dans le parseur
 * ne l'empêche sur un vrai lot importé dans le désordre —
 * `windowedSpeedMps` balayait sans bornes : un écart de temps négatif ne
 * dépassait jamais la fenêtre positive, et le balayage revenait jusqu'au
 * début de tout ce qui avait déjà été importé. Mesuré avant correctif :
 * 320 activités de 50 points (16 320 points) passent de 519 ms à 46 ms.
 */
function activiteRepetee(nbActivites: number, pointsParActivite: number) {
  const base = straightLine(4.5, 45.4, 2000, 2000 / pointsParActivite)
  const points: LonLat[] = []
  const times: number[] = []
  for (let a = 0; a < nbActivites; a++) {
    // Chaque activité repart de 0 : c'est l'horodatage qui recule entre deux
    // activités, pas un pas de temps qui change.
    let t = 0
    times.push(t)
    for (let i = 1; i < base.length; i++) {
      t += (distanceMeters(base[i - 1] as LonLat, base[i] as LonLat) / 1.3) * 1000
      times.push(t)
    }
    points.push(...base)
  }
  return { points, times }
}

describe('runMatching — plusieurs activités dont l’horodatage recule (#539)', () => {
  it('reste en dessous de 500 ms pour 320 activités concaténées (16 320 points)', () => {
    const itinerary = makeItinerary(1, [
      { osmWayId: 10, coords: straightLine(4.5, 45.4, 2000, 10) },
    ])
    const { points, times } = activiteRepetee(320, 50)

    const t0 = performance.now()
    runMatching([itinerary], points, {
      toleranceMeters: 50,
      computedAt: '2026-01-01T00:00:00Z',
      trackTimes: times,
    })
    const elapsed = performance.now() - t0

    expect(elapsed).toBeLessThan(500)
  }, 10_000)
})
