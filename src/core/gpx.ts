import type { LonLat } from './types.ts'

/** Erreur de lecture d'un fichier GPX, message affichable tel quel à l'utilisateur. */
export class GpxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GpxError'
  }
}

/** Sous-ensemble de DOMParser injecté pour rester testable hors navigateur. */
export interface XmlParser {
  parseFromString(text: string, type: 'text/xml'): Document
}

export interface ParsedGpx {
  points: LonLat[]
  /** Altitudes alignées sur les points (null quand le trkpt n'a pas de <ele>). */
  elevations: (number | null)[]
  /** Date de la trace (métadonnées, sinon premier point horodaté), sinon null. */
  date: string | null
}

/**
 * Parse un fichier GPX. Lève une GpxError (message en français) si le fichier
 * n'est pas un XML valide ou pas un GPX. Un GPX valide sans <trkpt> retourne
 * simplement zéro point.
 */
export function parseGpx(xmlText: string, parser: XmlParser): ParsedGpx {
  let doc: Document
  try {
    doc = parser.parseFromString(xmlText, 'text/xml')
  } catch {
    throw new GpxError(
      'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export GPX.',
    )
  }

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new GpxError(
      'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export GPX.',
    )
  }

  if (doc.documentElement.localName !== 'gpx') {
    throw new GpxError(
      'Ce fichier n’est pas un GPX (élément racine attendu : <gpx>).',
    )
  }

  const points: LonLat[] = []
  const elevations: (number | null)[] = []
  let firstPointDate: string | null = null
  const trkpts = doc.getElementsByTagName('trkpt')
  for (const trkpt of Array.from(trkpts)) {
    const lat = Number(trkpt.getAttribute('lat'))
    const lon = Number(trkpt.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    points.push([lon, lat])
    const ele = Number(
      trkpt.getElementsByTagName('ele')[0]?.textContent.trim() ?? NaN,
    )
    elevations.push(Number.isFinite(ele) ? ele : null)
    if (firstPointDate === null) {
      const time = trkpt.getElementsByTagName('time')[0]?.textContent.trim()
      if (time) firstPointDate = time
    }
  }

  const metadataTime = doc
    .getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('time')[0]
    ?.textContent.trim()

  return { points, elevations, date: metadataTime ?? firstPointDate }
}

/**
 * Dénivelé positif cumulé, avec hystérésis pour filtrer le bruit GPS :
 * une montée n'est comptée que lorsqu'elle dépasse `thresholdMeters` depuis
 * le dernier point bas. Retourne null si aucune altitude n'est exploitable.
 */
export function elevationGainMeters(
  elevations: (number | null)[],
  thresholdMeters = 3,
): number | null {
  let gain = 0
  let reference: number | null = null
  let hasData = false
  for (const elevation of elevations) {
    if (elevation === null) continue
    hasData = true
    if (reference === null) {
      reference = elevation
      continue
    }
    if (elevation - reference >= thresholdMeters) {
      gain += elevation - reference
      reference = elevation
    } else if (elevation < reference) {
      reference = elevation
    }
  }
  return hasData ? gain : null
}

/**
 * Empreinte du contenu d'une trace, pour détecter un double import du même
 * fichier (nombre de points + extrémités arrondies).
 */
export function trackFingerprint(points: LonLat[]): string {
  const round = (value: number) => value.toFixed(6)
  const first = points[0]
  const last = points[points.length - 1]
  return [
    points.length,
    first ? `${round(first[0])},${round(first[1])}` : '∅',
    last ? `${round(last[0])},${round(last[1])}` : '∅',
  ].join('|')
}
