import type { ParsedGpx, XmlParser } from './gpx.ts'
import type { LonLat } from './types.ts'

/**
 * Lecture d'un fichier TCX (Garmin Training Center).
 *
 * Troisième format d'export du monde Garmin, après le GPX et le FIT. On le
 * trouve surtout dans les archives anciennes : sans lui, un export Strava ou
 * Garmin d'il y a quelques années perd une partie de ses activités.
 *
 * C'est du XML, donc bien plus simple que le FIT — l'essentiel du travail
 * tient dans les cas limites, à commencer par les points sans position :
 * une montre horodate avant d'avoir fixé les satellites, et le début d'une
 * activité en est plein.
 */

export class TcxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TcxError'
  }
}

/** Racine d'un TCX, indépendamment du préfixe de namespace utilisé. */
const RACINE = 'TrainingCenterDatabase'

/** Vrai si le texte ressemble à un TCX, sans le parser entièrement. */
export function looksLikeTcx(text: string): boolean {
  return text.includes(`<${RACINE}`) || text.includes(`:${RACINE}`)
}

/**
 * Cherche par nom local : les TCX déclarent un namespace par défaut, mais
 * certains exports préfixent leurs balises. `getElementsByTagName` compare le
 * nom qualifié et raterait ces derniers.
 */
function enfants(element: Element | Document, nom: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', nom))
}

function nombre(element: Element | undefined): number {
  return Number(element ? element.textContent.trim() : Number.NaN)
}

export function parseTcx(xmlText: string, parser: XmlParser): ParsedGpx {
  let doc: Document
  try {
    doc = parser.parseFromString(xmlText, 'text/xml')
  } catch {
    throw new TcxError(
      'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export TCX.',
    )
  }

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new TcxError(
      'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export TCX.',
    )
  }

  if (doc.documentElement.localName !== RACINE) {
    throw new TcxError(
      `Ce fichier n’est pas un TCX (élément racine attendu : <${RACINE}>).`,
    )
  }

  const points: LonLat[] = []
  const elevations: (number | null)[] = []
  let premiereDate: string | null = null

  for (const trackpoint of enfants(doc, 'Trackpoint')) {
    // L'heure est relevée avant la position : un point non localisé dit quand
    // la sortie a commencé, même s'il ne dit pas où.
    if (premiereDate === null) {
      const time = enfants(trackpoint, 'Time')[0]?.textContent.trim()
      if (time) premiereDate = time
    }
    const position = enfants(trackpoint, 'Position')[0]
    if (!position) continue
    const lat = nombre(enfants(position, 'LatitudeDegrees')[0])
    const lon = nombre(enfants(position, 'LongitudeDegrees')[0])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    points.push([lon, lat])
    const altitude = nombre(enfants(trackpoint, 'AltitudeMeters')[0])
    elevations.push(Number.isFinite(altitude) ? altitude : null)
  }

  // <Id> porte l'heure de début déclarée de l'activité : plus fiable que
  // l'horodatage du premier point, qui peut précéder ou suivre le départ.
  const idActivite = enfants(doc, 'Id')[0]?.textContent.trim()

  return { points, elevations, date: idActivite ?? premiereDate }
}
