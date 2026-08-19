import { distanceMeters } from './geo.ts'
import type { ElevationProfile, LonLat } from './types.ts'

/** Erreur du service altimétrique, message affichable tel quel à l'utilisateur. */
export class ElevationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElevationError'
  }
}

/**
 * Service Géoplateforme IGN (licence ouverte Etalab 2.0, même famille que le
 * fond de carte Plan IGN v2) : calcul altimétrique le long d'une polyligne.
 * https://geoservices.ign.fr/documentation/services/api-et-services-ogc/calcul-altimetrique-rest
 */
export const ELEVATION_ENDPOINT =
  'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json'
export const ELEVATION_RESOURCE = 'ign_rge_alti_wld'

/** Nombre max de points envoyés au service (au-delà, sous-échantillonnage). */
export const MAX_ELEVATION_POINTS = 100

/** Sous-échantillonne une polyligne à `maxPoints` points (garde 1er et dernier). */
export function downsample(coords: LonLat[], maxPoints: number): LonLat[] {
  if (coords.length <= maxPoints) return coords
  const step = (coords.length - 1) / (maxPoints - 1)
  const result: LonLat[] = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.round(i * step), coords.length - 1)
    result.push(coords[idx] as LonLat)
  }
  return result
}

/** Construit l'URL de la requête altimétrique pour une polyligne. */
export function buildElevationLineUrl(coords: LonLat[]): string {
  const points = downsample(coords, MAX_ELEVATION_POINTS)
  const lon = points.map((p) => p[0].toFixed(6)).join('|')
  const lat = points.map((p) => p[1].toFixed(6)).join('|')
  const params = new URLSearchParams({
    lon,
    lat,
    resource: ELEVATION_RESOURCE,
    delimiter: '|',
    indent: 'false',
    measures: 'false',
  })
  return `${ELEVATION_ENDPOINT}?${params.toString()}`
}

interface RawElevationPoint {
  z?: number
  alt?: number
  elevation?: number
}

// Le service retourne -99999 pour une zone hors couverture (documentation IGN).
function isFiniteAltitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > -9000
}

/**
 * Extrait les altitudes d'une réponse du service altimétrique, alignées sur
 * les points sous-échantillonnés. Lève une ElevationError si la réponse n'a
 * pas la forme attendue.
 */
export function parseElevationResponse(
  data: unknown,
  coords: LonLat[],
): (number | null)[] {
  const points = downsample(coords, MAX_ELEVATION_POINTS)
  const raw = (data as { elevations?: RawElevationPoint[] } | null)?.elevations
  if (!Array.isArray(raw)) {
    throw new ElevationError('Réponse du service altimétrique illisible.')
  }
  return points.map((_, i) => {
    const point: RawElevationPoint | undefined = raw[i]
    const value = point?.z ?? point?.alt ?? point?.elevation
    return isFiniteAltitude(value) ? value : null
  })
}

export interface ElevationStats {
  gain: number
  loss: number
  min: number
  max: number
}

/**
 * Statistiques d'un profil altimétrique, avec hystérésis anti-bruit GPS/DEM :
 * une variation n'est comptée que si elle dépasse `thresholdMeters` depuis le
 * dernier extremum. Retourne null si aucune altitude n'est exploitable.
 */
export function elevationStats(
  elevations: (number | null)[],
  thresholdMeters = 3,
): ElevationStats | null {
  let gain = 0
  let loss = 0
  let min = Infinity
  let max = -Infinity
  let reference: number | null = null
  let hasData = false

  for (const elevation of elevations) {
    if (elevation === null) continue
    hasData = true
    min = Math.min(min, elevation)
    max = Math.max(max, elevation)
    if (reference === null) {
      reference = elevation
      continue
    }
    const delta = elevation - reference
    if (delta >= thresholdMeters) {
      gain += delta
      reference = elevation
    } else if (-delta >= thresholdMeters) {
      loss += -delta
      reference = elevation
    }
  }

  return hasData ? { gain, loss, min, max } : null
}

/**
 * Comble les trous (null) d'un profil altimétrique par interpolation
 * linéaire entre les valeurs connues qui l'entourent ; les trous en tête ou
 * en queue reprennent la valeur connue la plus proche. Pour l'affichage
 * d'un graphique uniquement — les statistiques (elevationStats) travaillent
 * sur les données brutes, sans comblement.
 */
export function fillElevationGaps(elevations: (number | null)[]): number[] {
  const result = [...elevations]
  const knownIndices = result
    .map((v, i) => (v !== null ? i : -1))
    .filter((i) => i >= 0)
  if (knownIndices.length === 0) return result.map(() => 0)

  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) continue
    const before = [...knownIndices].reverse().find((k) => k < i)
    const after = knownIndices.find((k) => k > i)
    if (before === undefined) {
      result[i] = result[after as number] as number
    } else if (after === undefined) {
      result[i] = result[before] as number
    } else {
      const vBefore = result[before] as number
      const vAfter = result[after] as number
      const t = (i - before) / (after - before)
      result[i] = vBefore + (vAfter - vBefore) * t
    }
  }
  return result as number[]
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface FetchElevationOptions {
  fetchFn?: FetchLike
  timeoutMs?: number
}

/**
 * Récupère le profil altimétrique d'une polyligne (distances cumulées +
 * altitudes). Lève une ElevationError en français si le service échoue —
 * à l'appelant de dégrader gracieusement, le relief n'est jamais bloquant.
 */
export async function fetchElevationProfile(
  coords: LonLat[],
  options: FetchElevationOptions = {},
): Promise<ElevationProfile> {
  if (coords.length < 2) {
    throw new ElevationError('Tracé trop court pour un profil altimétrique.')
  }
  const fetchFn: FetchLike = options.fetchFn ?? ((url, init) => fetch(url, init))
  const timeoutMs = options.timeoutMs ?? 20_000
  const points = downsample(coords, MAX_ELEVATION_POINTS)

  let response: Response
  try {
    let signal: AbortSignal | undefined
    try {
      signal = AbortSignal.timeout(timeoutMs)
    } catch {
      signal = undefined
    }
    response = await fetchFn(
      buildElevationLineUrl(coords),
      signal ? { signal } : {},
    )
  } catch {
    throw new ElevationError(
      'Le service altimétrique IGN est injoignable : le relief ne peut pas être affiché pour l’instant.',
    )
  }
  if (!response.ok) {
    throw new ElevationError(
      'Le service altimétrique IGN est injoignable : le relief ne peut pas être affiché pour l’instant.',
    )
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ElevationError('Réponse du service altimétrique illisible.')
  }
  const elevations = parseElevationResponse(data, coords)

  const distances: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1] as LonLat
    const cur = points[i] as LonLat
    distances.push((distances[i - 1] as number) + distanceMeters(prev, cur))
  }

  return { distances, elevations, coords: points }
}

/** Un point du profil : où c'est sur le tracé, à quelle altitude, à quelle distance. */
export interface ProfilePoint {
  distanceMeters: number
  elevation: number | null
  point: LonLat
}

/**
 * Point du tracé situé à `target` mètres du départ, interpolé entre les deux
 * relevés qui l'encadrent. C'est ce qui relie le graphique à la carte : un
 * profil altimétrique sans localisation ne dit pas *où* ça grimpe.
 */
export function pointAtDistance(
  profile: ElevationProfile,
  target: number,
): ProfilePoint | null {
  const { distances, coords, elevations } = profile
  if (coords.length === 0 || distances.length === 0) return null
  const dernier = distances.length - 1
  const fin = distances[dernier] ?? 0
  const borne = Math.min(Math.max(target, 0), fin)

  let apres = distances.findIndex((d) => d >= borne)
  if (apres < 0) apres = dernier
  const avant = Math.max(0, apres - 1)
  const dAvant = distances[avant] ?? 0
  const dApres = distances[apres] ?? dAvant
  const pAvant = coords[Math.min(avant, coords.length - 1)]
  const pApres = coords[Math.min(apres, coords.length - 1)]
  if (!pAvant || !pApres) return null

  const t = dApres === dAvant ? 0 : (borne - dAvant) / (dApres - dAvant)
  const eAvant = elevations[avant] ?? null
  const eApres = elevations[apres] ?? null
  // Une altitude manquante ne s'interpole pas : on préfère ne rien annoncer.
  const elevation =
    eAvant === null || eApres === null ? null : eAvant + (eApres - eAvant) * t

  return {
    distanceMeters: borne,
    elevation,
    point: [
      pAvant[0] + (pApres[0] - pAvant[0]) * t,
      pAvant[1] + (pApres[1] - pAvant[1]) * t,
    ],
  }
}
