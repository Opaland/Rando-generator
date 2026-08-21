import { estDansLeMonde } from './coordonnees.ts'
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
  /** Nombre de points écartés parce qu'ils tombaient hors du monde (issue #167). */
  pointsHorsLimites: number
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

  // Un GPX peut décrire une trace enregistrée (<trk><trkseg><trkpt>) ou un
  // parcours planifié/exporté (<rte><rtept>) — les deux sont valides côté
  // schéma GPX 1.1 et partagent la même structure de point. Certains exports
  // (ex. Suunto app pour un « parcours ») ne produisent que des <rtept>.
  let { points, elevations, firstPointDate, pointsHorsLimites } = extractPoints(
    doc,
    'trkpt',
  )
  // Un <trk> dont tous les points sont hors bornes n'est pas un fichier sans
  // <trkpt> : on ne va pas chercher un <rte> qui n'existe pas, et surtout on
  // ne perd pas le compte de ce qui vient d'être écarté.
  if (points.length === 0 && pointsHorsLimites === 0) {
    ;({ points, elevations, firstPointDate, pointsHorsLimites } = extractPoints(
      doc,
      'rtept',
    ))
  }

  const metadataTime = doc
    .getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('time')[0]
    ?.textContent.trim()

  return {
    points,
    elevations,
    date: metadataTime ?? firstPointDate,
    pointsHorsLimites,
  }
}

interface ExtractedPoints {
  points: LonLat[]
  elevations: (number | null)[]
  firstPointDate: string | null
  pointsHorsLimites: number
}

/** Extrait points/altitudes/première date d'horodatage pour un tag donné (trkpt ou rtept). */
function extractPoints(doc: Document, tagName: 'trkpt' | 'rtept'): ExtractedPoints {
  const points: LonLat[] = []
  const elevations: (number | null)[] = []
  let firstPointDate: string | null = null
  let pointsHorsLimites = 0
  for (const pt of Array.from(doc.getElementsByTagName(tagName))) {
    const lat = Number(pt.getAttribute('lat'))
    const lon = Number(pt.getAttribute('lon'))
    // Une coordonnée illisible (`lat="nord"`) est un fichier cassé, pas un
    // point mal placé : la compter fausserait le message rendu à l'utilisateur.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (!estDansLeMonde(lon, lat)) {
      pointsHorsLimites += 1
      continue
    }
    points.push([lon, lat])
    const ele = Number(
      pt.getElementsByTagName('ele')[0]?.textContent.trim() ?? NaN,
    )
    elevations.push(Number.isFinite(ele) ? ele : null)
    if (firstPointDate === null) {
      const time = pt.getElementsByTagName('time')[0]?.textContent.trim()
      if (time) firstPointDate = time
    }
  }
  return { points, elevations, firstPointDate, pointsHorsLimites }
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
