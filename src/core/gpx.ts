import { estDansLeMonde } from './coordonnees.ts'
import { verifierDomaine } from './domaine.ts'
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
  /**
   * Horodatage de chaque point, en **millisecondes depuis l'époque Unix**,
   * aligné sur `points` (issue #149).
   *
   * Le temps n'était lu que pour le premier point, afin de dater la trace,
   * puis oublié. C'est pourtant la seule information qui distingue une
   * marche d'un trajet en voiture : des points espacés de 470 m le long
   * d'un sentier créditent plus de 90 % sans qu'aucun contrôle soit
   * possible.
   *
   * En nombre et non en chaîne ISO : ces tableaux finissent en base et dans
   * les sauvegardes. Mesuré sur une trace de 10 000 points — 254 ko en ISO
   * contre 88 ko en millisecondes, pour la même information à la
   * milliseconde près. `date` reste une chaîne ISO : elle est affichée, pas
   * calculée.
   */
  times: (number | null)[]
  /**
   * Précision horizontale rapportée par l'appareil (HDOP), alignée sur
   * `points`. Sans elle, un bruit de ±60 m autour du sentier crédite 100 %
   * exactement comme une trace propre — le moteur ne voit aucune
   * différence, et ne peut pas en voir.
   *
   * `null` — et non un tableau de `null` — quand le format ne porte pas du
   * tout cette mesure. La distinction est utile : un tableau de `null` dit
   * « le format la rapporte, ce fichier ne l'a pas renseignée », ce qui est
   * le cas d'un GPX exporté d'un logiciel de tracé.
   */
  hdops: (number | null)[] | null
  /**
   * Précision horizontale en **mètres**, alignée sur `points`. C'est ce que
   * rapporte le FIT (`gps_accuracy`), et le GPX ne la porte pas — d'où
   * `null` chez ce dernier.
   *
   * Volontairement séparée de `hdops` : un HDOP est sans dimension, une
   * précision est en mètres, et passer de l'un à l'autre demande un facteur
   * que personne n'a mesuré ici. Les fusionner reviendrait à inventer ce
   * facteur en le cachant — l'issue #149 supposait que le FIT portait un
   * hdop ; il porte autre chose.
   */
  precisionsMetres: (number | null)[] | null
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
  const trace = extractPoints(doc, 'trkpt')
  // Un <trk> vide — ou dont tous les points ont été écartés — ne doit pas
  // empêcher de lire le <rte> qui l'accompagne : c'est là que se trouvent
  // les points exploitables. Les deux comptes s'additionnent, pour ne
  // sacrifier ni les données ni ce qu'on doit dire à leur sujet.
  const parcours =
    trace.points.length === 0 ? extractPoints(doc, 'rtept') : null
  const { points, elevations, times, hdops, firstPointDate } =
    parcours ?? trace
  const pointsHorsLimites =
    trace.pointsHorsLimites + (parcours?.pointsHorsLimites ?? 0)

  /*
    Le domaine où la géométrie est juste (issue #170).

    Un tracé qui franchit ±180° est mesuré par une projection qui ne sait pas
    l'enrouler : 212 m y deviennent 38 280 833 m, et le pourcentage de
    complétion avec. Mieux vaut refuser en disant pourquoi que rendre un
    chiffre faux sans le dire.
  */
  const horsDomaine = verifierDomaine(points)
  if (horsDomaine) throw new GpxError(horsDomaine)

  const metadataTime = doc
    .getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('time')[0]
    ?.textContent.trim()

  return {
    points,
    elevations,
    times,
    hdops,
    // Le GPX rapporte un HDOP, jamais une précision en mètres.
    precisionsMetres: null,
    date: metadataTime ?? firstPointDate,
    pointsHorsLimites,
  }
}

interface ExtractedPoints {
  points: LonLat[]
  elevations: (number | null)[]
  times: (number | null)[]
  hdops: (number | null)[]
  firstPointDate: string | null
  pointsHorsLimites: number
}

/**
 * Extrait points, altitudes, horodatages et HDOP pour un tag donné (trkpt
 * ou rtept), plus la première date rencontrée.
 */
function extractPoints(doc: Document, tagName: 'trkpt' | 'rtept'): ExtractedPoints {
  const points: LonLat[] = []
  const elevations: (number | null)[] = []
  const times: (number | null)[] = []
  const hdops: (number | null)[] = []
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

    // Les quatre tableaux avancent ensemble, y compris quand un point est
    // écarté : un décalage d'un cran rendrait la vitesse calculée absurde.
    const time = pt.getElementsByTagName('time')[0]?.textContent.trim()
    // Un <time> illisible ne vaut pas mieux qu'un <time> absent : NaN
    // décalerait toute vitesse calculée à partir de lui.
    const instant = time ? Date.parse(time) : Number.NaN
    times.push(Number.isFinite(instant) ? instant : null)
    if (firstPointDate === null && time) firstPointDate = time

    const hdop = Number(
      pt.getElementsByTagName('hdop')[0]?.textContent.trim() ?? NaN,
    )
    hdops.push(Number.isFinite(hdop) ? hdop : null)
  }
  return {
    points,
    elevations,
    times,
    hdops,
    firstPointDate,
    pointsHorsLimites,
  }
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
 * Nombre de points intermédiaires retenus dans l'empreinte d'une trace.
 *
 * L'empreinte ne regardait que le nombre de points et les deux extrémités
 * (issue #165) : deux boucles parties du même parking, de même longueur et
 * passant par des vallées opposées étaient indiscernables — et la seconde
 * refusée. Huit relevés répartis le long du tracé les séparent, sans faire
 * de l'empreinte une copie de la trace.
 */
const RELEVES_INTERMEDIAIRES = 8

/**
 * Empreinte du contenu d'une trace, pour détecter un double import du même
 * fichier : nombre de points, extrémités, et quelques relevés intermédiaires.
 *
 * L'échantillonnage se fait par indice, pas par distance : deux fois le même
 * fichier donnent exactement les mêmes indices, donc exactement la même
 * empreinte — ce que le dédoublonnage doit avant tout garantir.
 *
 * Elle reste une heuristique, et le restera : elle ne lit pas tous les
 * points. C'est pourquoi un refus de doublon doit rester rattrapable par la
 * personne (« importer quand même »), plutôt que d'affirmer une identité
 * qu'elle ne peut pas prouver.
 */
export function trackFingerprint(points: LonLat[]): string {
  const round = (value: number) => value.toFixed(6)
  const releve = (point: LonLat | undefined) =>
    point ? `${round(point[0])},${round(point[1])}` : '∅'

  const morceaux = [String(points.length), releve(points[0])]
  // Bornes exclues : les extrémités sont déjà là, et les redoubler
  // gaspillerait des relevés sur une trace courte.
  for (let i = 1; i <= RELEVES_INTERMEDIAIRES; i += 1) {
    const indice = Math.floor(
      (points.length * i) / (RELEVES_INTERMEDIAIRES + 1),
    )
    morceaux.push(releve(points[indice]))
  }
  morceaux.push(releve(points[points.length - 1]))
  return morceaux.join('|')
}
