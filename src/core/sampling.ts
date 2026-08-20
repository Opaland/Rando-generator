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

/**
 * Portion d'une polyligne entre deux distances curvilignes, **sommets
 * intermédiaires compris**.
 *
 * Sert à colorer ce qui a été parcouru en épousant la géométrie réelle du
 * chemin. Relier directement deux échantillons distants de cent mètres coupe
 * les lacets : dans une épingle de montagne, le trait passe à travers le
 * virage au lieu de le suivre (issue #142).
 *
 * Les bornes sont ramenées dans la polyligne plutôt qu'extrapolées : un
 * échantillon situé au-delà de la fin d'un way ne doit pas inventer du
 * chemin.
 */
export function slicePolyline(
  coords: LonLat[],
  fromMeters: number,
  toMeters: number,
): LonLat[] {
  if (coords.length < 2) return []
  const total = polylineLengthMeters(coords)
  const debut = Math.max(0, Math.min(fromMeters, total))
  const fin = Math.max(0, Math.min(toMeters, total))
  if (fin <= debut) return []

  const portion: LonLat[] = []
  let parcouru = 0
  for (let i = 1; i < coords.length; i++) {
    const from = coords[i - 1] as LonLat
    const to = coords[i] as LonLat
    const segLen = distanceMeters(from, to)
    if (segLen === 0) continue
    const segDebut = parcouru
    const segFin = parcouru + segLen
    parcouru = segFin
    if (segFin <= debut || segDebut >= fin) continue

    // Premier point de la portion : soit le début exact demandé, soit le
    // sommet du chemin déjà atteint.
    if (portion.length === 0) {
      portion.push(
        debut <= segDebut
          ? from
          : interpolate(from, to, (debut - segDebut) / segLen),
      )
    }
    portion.push(
      fin >= segFin ? to : interpolate(from, to, (fin - segDebut) / segLen),
    )
  }
  return portion.length >= 2 ? portion : []
}
