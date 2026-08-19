import { CELL_SIZE_DEG, type LonLat } from './types.ts'

export const EARTH_RADIUS_METERS = 6_371_000

const DEG_TO_RAD = Math.PI / 180

/**
 * Distance approchée entre deux points par projection équirectangulaire.
 * Suffisante aux échelles d'un matching à 25–100 m de tolérance.
 */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const meanLatRad = ((a[1] + b[1]) / 2) * DEG_TO_RAD
  const x = (b[0] - a[0]) * DEG_TO_RAD * Math.cos(meanLatRad)
  const y = (b[1] - a[1]) * DEG_TO_RAD
  return EARTH_RADIUS_METERS * Math.hypot(x, y)
}

/**
 * Distance d'un point au segment [a, b], et non à ses extrémités.
 *
 * C'est la différence entre « mon GPS a enregistré un point à moins de 50 m »
 * et « je suis passé à moins de 50 m » : un appareil qui n'enregistre qu'un
 * point tous les 500 m suit pourtant bien le sentier entre deux relevés.
 */
export function distanceToSegmentMeters(
  point: LonLat,
  a: LonLat,
  b: LonLat,
): number {
  // Projection locale en mètres autour du segment : à ces échelles, l'erreur
  // est négligeable devant la tolérance de matching.
  const meanLatRad = ((a[1] + b[1]) / 2) * DEG_TO_RAD
  const kx = EARTH_RADIUS_METERS * DEG_TO_RAD * Math.cos(meanLatRad)
  const ky = EARTH_RADIUS_METERS * DEG_TO_RAD

  const ax = a[0] * kx
  const ay = a[1] * ky
  const bx = b[0] * kx
  const by = b[1] * ky
  const px = point[0] * kx
  const py = point[1] * ky

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)

  // Projection scalaire, bornée au segment.
  const t = Math.min(
    1,
    Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  )
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Indices entiers de la cellule de hachage spatial contenant le point. */
export function cellIndices(lon: number, lat: number): [number, number] {
  return [Math.floor(lon / CELL_SIZE_DEG), Math.floor(lat / CELL_SIZE_DEG)]
}

/** Clé de cellule à partir des indices entiers. */
export function cellKeyFromIndices(cx: number, cy: number): string {
  return `${cx}:${cy}`
}

/** Clé de la cellule de hachage spatial contenant le point. */
export function cellKey(lon: number, lat: number): string {
  const [cx, cy] = cellIndices(lon, lat)
  return cellKeyFromIndices(cx, cy)
}

/** Interpolation linéaire entre deux points (t dans [0, 1]). */
export function interpolate(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Cap initial (0–360°, 0 = nord) du grand cercle de a vers b. */
export function bearingDegrees(a: LonLat, b: LonLat): number {
  const lat1 = a[1] * DEG_TO_RAD
  const lat2 = b[1] * DEG_TO_RAD
  const dLon = (b[0] - a[0]) * DEG_TO_RAD
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = Math.atan2(y, x) / DEG_TO_RAD
  return (bearing + 360) % 360
}
