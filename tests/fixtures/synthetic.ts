import type { LonLat } from '../../src/core/types.ts'

/** Rayon terrestre utilisé partout dans l'application. */
export const EARTH_RADIUS = 6_371_000
export const METERS_PER_DEG = (EARTH_RADIUS * Math.PI) / 180

/** Convertit un déplacement en mètres vers des degrés de latitude. */
export function metersToDegLat(m: number): number {
  return m / METERS_PER_DEG
}

/** Convertit un déplacement en mètres vers des degrés de longitude à une latitude donnée. */
export function metersToDegLon(m: number, lat: number): number {
  return m / (METERS_PER_DEG * Math.cos((lat * Math.PI) / 180))
}

/**
 * Ligne droite ouest→est à latitude constante, découpée en segments réguliers.
 * @param originLon longitude de départ
 * @param lat latitude constante
 * @param totalMeters longueur totale
 * @param segmentMeters longueur de chaque segment
 */
export function straightLine(
  originLon: number,
  lat: number,
  totalMeters: number,
  segmentMeters: number,
): LonLat[] {
  const coords: LonLat[] = []
  const n = Math.round(totalMeters / segmentMeters)
  for (let i = 0; i <= n; i++) {
    coords.push([originLon + metersToDegLon(i * segmentMeters, lat), lat])
  }
  return coords
}

/** Décale une polyligne vers le nord d'une distance en mètres. */
export function shiftNorth(coords: LonLat[], meters: number): LonLat[] {
  const dLat = metersToDegLat(meters)
  return coords.map(([lon, lat]) => [lon, lat + dLat])
}
