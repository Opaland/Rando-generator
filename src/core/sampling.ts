import { distanceMeters, interpolate } from './geo.ts'
import type { LonLat } from './types.ts'

/** Longueur d'une polyligne en mètres. */
export function polylineLengthMeters(coords: LonLat[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += distanceMeters(coords[i - 1] as LonLat, coords[i] as LonLat)
  }
  return total
}

/**
 * Échantillonne une polyligne tous les `stepMeters` par interpolation linéaire,
 * en reportant le reliquat d'un segment au suivant (pas de dérive cumulative).
 * Le premier échantillon est le départ du way ; un way de moins de 2 points
 * ne produit aucun échantillon.
 */
export function sampleWay(coords: LonLat[], stepMeters: number): LonLat[] {
  if (coords.length < 2) return []

  // Tolère les erreurs d'arrondi flottant pour ne pas perdre l'échantillon
  // situé exactement en fin de segment.
  const EPSILON = 1e-6

  const samples: LonLat[] = [coords[0] as LonLat]
  // Distance restant à parcourir avant le prochain échantillon.
  let toNext = stepMeters

  for (let i = 1; i < coords.length; i++) {
    const from = coords[i - 1] as LonLat
    const to = coords[i] as LonLat
    const segLen = distanceMeters(from, to)
    if (segLen === 0) continue

    // Position déjà parcourue sur ce segment.
    let covered = 0
    while (segLen - covered >= toNext - EPSILON) {
      covered += toNext
      samples.push(interpolate(from, to, Math.min(covered / segLen, 1)))
      toNext = stepMeters
    }
    toNext -= segLen - covered
  }

  return samples
}
