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
  let firstPointDate: string | null = null
  const trkpts = doc.getElementsByTagName('trkpt')
  for (const trkpt of Array.from(trkpts)) {
    const lat = Number(trkpt.getAttribute('lat'))
    const lon = Number(trkpt.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    points.push([lon, lat])
    if (firstPointDate === null) {
      const time = trkpt.getElementsByTagName('time')[0]?.textContent.trim()
      if (time) firstPointDate = time
    }
  }

  const metadataTime = doc
    .getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('time')[0]
    ?.textContent.trim()

  return { points, date: metadataTime ?? firstPointDate }
}
