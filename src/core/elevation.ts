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
const ELEVATION_ENDPOINT =
  'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json'
const ELEVATION_RESOURCE = 'ign_rge_alti_wld'

/** Nombre max de points envoyés au service (au-delà, sous-échantillonnage). */
export const MAX_ELEVATION_POINTS = 100

/**
 * Les **indices** retenus par le sous-échantillonnage.
 *
 * Nommé, parce que trois choses en dépendent et qu'elles doivent retenir les
 * mêmes points : la polyligne envoyée au service, les altitudes qui en
 * reviennent, et les distances qui leur sont associées. L'arithmétique était
 * écrite une fois et refaite ailleurs ; c'est ainsi que l'axe des distances a
 * fini par mesurer autre chose que le tracé (CLAUDE.md §4).
 */
function indicesEchantillons(
  nbPoints: number,
  maxPoints: number,
): number[] {
  if (nbPoints <= maxPoints) {
    return Array.from({ length: nbPoints }, (_, i) => i)
  }
  const step = (nbPoints - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) =>
    Math.min(Math.round(i * step), nbPoints - 1),
  )
}

/** Sous-échantillonne une polyligne à `maxPoints` points (garde 1er et dernier). */
export function downsample(coords: LonLat[], maxPoints: number): LonLat[] {
  return indicesEchantillons(coords.length, maxPoints).map(
    (i) => coords[i] as LonLat,
  )
}

/**
 * Distance cumulée en chaque point d'une polyligne, en suivant **chaque
 * segment**.
 *
 * C'est le correctif du retour du 22/08 sur la Via Lugdunum. L'axe des
 * distances du profil était calculé sur les points *retenus* : il mesurait
 * les cordes tendues entre deux relevés, et non le sentier qui serpente
 * entre eux. Mesuré sur la géométrie OSM réelle du « Sentier des Crêtes »,
 * garder un point sur deux coûte 28,2 % de longueur — et le profil est
 * plafonné à cent points, soit un taux bien plus sévère sur un long
 * itinéraire.
 *
 * Conséquence pour qui lit : le repère « 21,4 km » ne désignait pas le
 * kilomètre 21,4 du terrain, et la longueur du profil contredisait celle que
 * le matching mesure en parcourant la géométrie complète. Deux nombres pour
 * la même chose.
 */
function distancesCumulees(coords: LonLat[]): number[] {
  const cumul: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cumul.push(
      (cumul[i - 1] as number) +
        distanceMeters(coords[i - 1] as LonLat, coords[i] as LonLat),
    )
  }
  return cumul
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

  // Les distances viennent de la géométrie **complète**, relevées aux
  // indices retenus : le profil parle donc du même kilométrage que le reste
  // de l'application.
  const cumul = distancesCumulees(coords)
  const distances = indicesEchantillons(
    coords.length,
    MAX_ELEVATION_POINTS,
  ).map((i) => cumul[i] as number)

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

/**
 * Espacement moyen entre deux relevés d'altitude, en mètres.
 *
 * Le profil est plafonné à `MAX_ELEVATION_POINTS` relevés, quelle que soit
 * la longueur : 51 m sur un itinéraire de 5 km, 2 020 m sur 200 km,
 * 4 545 m sur 450 km. Ce nombre décide de ce qu'on peut affirmer d'une
 * altitude lue entre deux relevés.
 */
function resolutionProfil(profile: ElevationProfile): number | null {
  const n = profile.distances.length
  if (n < 2) return null
  const fin = profile.distances[n - 1] ?? 0
  return fin / (n - 1)
}

/**
 * Au-delà de cet espacement, un col peut se cacher entre deux relevés.
 *
 * **Seuil de présentation, tranché au jugement** — il ne change rien à ce
 * qui est calculé, seulement le moment où l'on prévient (CLAUDE.md §2).
 * Cinq cents mètres, parce que c'est l'ordre de grandeur auquel le relief
 * varie : en dessous, un col ou un creux laisse au moins un relevé le
 * traverser ; au-dessus, il peut passer entre les mailles sans laisser de
 * trace sur la courbe.
 *
 * Écarté : l'accrocher au pas du matching (100 m), qui aurait fait
 * apparaître l'avertissement sur presque tous les itinéraires et l'aurait
 * noyé. Écarté aussi : une fraction de la longueur, qui aurait dit la même
 * chose pour un sentier de 3 km et pour un GR de 400.
 */
const RESOLUTION_GROSSIERE_METRES = 500

/**
 * Ce qu'on écrit sous le profil quand ses relevés sont trop espacés pour
 * qu'une altitude lue entre deux d'entre eux veuille dire quelque chose.
 *
 * Retour du 22/08 sur la Via Lugdunum : « km 21.4, l'altitude de 714 m ne
 * correspond pas à l'altitude du point ». Elle ne le pouvait pas — c'était
 * la valeur d'une droite tendue entre deux relevés distants de deux
 * kilomètres. Le chiffre n'était pas faux par erreur de calcul : il était
 * présenté comme une mesure alors qu'il est une interpolation.
 *
 * Rendre `null` quand les relevés sont serrés : une mise en garde affichée
 * partout ne se lit plus nulle part.
 */
export function libelleResolution(profile: ElevationProfile): string | null {
  const espacement = resolutionProfil(profile)
  if (espacement === null || espacement <= RESOLUTION_GROSSIERE_METRES) {
    return null
  }
  const distance =
    espacement >= 1000
      ? `${(espacement / 1000).toFixed(1).replace('.', ',')} km`
      : `${String(Math.round(espacement))} m`
  return `altitude relevée tous les ${distance} — entre deux relevés la courbe est une droite, et un col peut s’y cacher.`
}
