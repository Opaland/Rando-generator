import { estDansLeMonde } from './coordonnees.ts'
import { verifierDomaine } from './domaine.ts'
import { elevationStats, HYSTERESIS_ALTIMETRIQUE_METRES } from './elevation.ts'
import { instantDe, nombreLu } from './valeurLue.ts'
import { tranchesDe } from './segmentsDeTrace.ts'
import type { LonLat, SourceItineraire } from './types.ts'

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
   * Où commence chaque `<trkseg>` (ou `<trk>`), en indice de `points` (#560).
   * Le schéma GPX 1.1 dit qu'un segment est une suite continue de points :
   * une montre en ouvre un nouveau après une pause ou une perte de signal.
   * Absent pour les formats qui ne le portent pas (FIT, TCX).
   */
  debutsDeSegment?: number[]
  /**
   * La source que le fichier déclare dans `<metadata><copyright>` (#557).
   * Sentiers l'écrit dans chaque export d'une donnée sous licence ; sans la
   * relire, réimporter un export coupait la chaîne d'attribution. Absent
   * pour les formats qui ne la portent pas (FIT, TCX).
   */
  source?: SourceItineraire | null
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
  const { points, elevations, times, hdops, firstPointDate, debutsDeSegment } =
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
    debutsDeSegment,
    source: copyrightDe(doc),
    // Une date illisible ne vaut pas mieux qu'une date absente : elle
    // s'affichait « Invalid Date » (#567).
    date:
      metadataTime && instantDe(metadataTime) !== null
        ? metadataTime
        : firstPointDate,
    pointsHorsLimites,
  }
}

/** `<copyright author="…"><license>…</license></copyright>`, s'il est complet. */
function copyrightDe(doc: Document): SourceItineraire | null {
  const copyright = doc
    .getElementsByTagName('metadata')[0]
    ?.getElementsByTagName('copyright')[0]
  const author = copyright?.getAttribute('author')?.trim()
  const license = copyright
    ?.getElementsByTagName('license')[0]
    ?.textContent.trim()
  return author && license ? { author, license } : null
}

interface ExtractedPoints {
  debutsDeSegment: number[]
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
  // La coupure se pose au premier point **gardé** d'un nouveau segment : un
  // point écarté ne doit ni la décaler, ni en créer une pour un segment
  // dont rien ne reste.
  const debutsDeSegment: number[] = []
  let segmentDuDernierGarde: Element | null = null
  for (const pt of Array.from(doc.getElementsByTagName(tagName))) {
    const lat = nombreLu(pt.getAttribute('lat'))
    const lon = nombreLu(pt.getAttribute('lon'))
    // Une coordonnée illisible (`lat="nord"`) ou absente est un fichier
    // cassé, pas un point mal placé — et surtout pas un point sur
    // l'équateur (#567) : la compter fausserait le message rendu.
    if (lat === null || lon === null) continue
    if (!estDansLeMonde(lon, lat)) {
      pointsHorsLimites += 1
      continue
    }
    if (points.length > 0 && pt.parentElement !== segmentDuDernierGarde) {
      debutsDeSegment.push(points.length)
    }
    segmentDuDernierGarde = pt.parentElement
    points.push([lon, lat])
    elevations.push(
      nombreLu(pt.getElementsByTagName('ele')[0]?.textContent),
    )

    // Les quatre tableaux avancent ensemble, y compris quand un point est
    // écarté : un décalage d'un cran rendrait la vitesse calculée absurde.
    const time = pt.getElementsByTagName('time')[0]?.textContent.trim()
    // Un <time> illisible ne vaut pas mieux qu'un <time> absent : NaN
    // décalerait toute vitesse calculée à partir de lui.
    const instant = instantDe(time)
    times.push(instant)
    if (firstPointDate === null && time && instant !== null) firstPointDate = time

    hdops.push(nombreLu(pt.getElementsByTagName('hdop')[0]?.textContent))
  }
  return {
    points,
    elevations,
    times,
    hdops,
    firstPointDate,
    pointsHorsLimites,
    debutsDeSegment,
  }
}

/**
 * Dénivelé positif cumulé, avec hystérésis pour filtrer le bruit GPS : une
 * montée (ou une descente) n'est comptée que lorsqu'elle dépasse
 * `thresholdMeters` depuis la dernière référence. Retourne null si aucune
 * altitude n'est exploitable.
 *
 * Délègue à `elevationStats` (elevation.ts, la même hystérésis symétrique
 * que le profil planifié) plutôt que de recalculer : une chasse aux jumeaux
 * du 23/09 a trouvé ici une seconde formule, asymétrique, qui rendait un
 * chiffre différent sur un simple creux de terrain sous le seuil — corrigé
 * le 25/09, décision de Cédric (symétrique partout).
 */
export function elevationGainMeters(
  elevations: (number | null)[],
  thresholdMeters = HYSTERESIS_ALTIMETRIQUE_METRES,
): number | null {
  return elevationStats(elevations, thresholdMeters)?.gain ?? null
}

/**
 * Le dénivelé positif d'une trace en plusieurs tronçons, chacun compté à
 * part. Une seule règle pour la trace importée et la sortie enregistrée
 * (`deniveleParcouru` l'appelle) : sans elle, la montée faite en voiture
 * entre deux `<trkseg>` comptait en D+ (#560).
 * `null` quand aucun tronçon n'a d'altitude exploitable.
 */
export function deniveleParTroncons(
  elevations: (number | null)[],
  debutsDeSegment: number[] | undefined,
): number | null {
  const gains = tranchesDe({ points: elevations, debutsDeSegment }).map(
    ([debut, fin]) => elevationGainMeters(elevations.slice(debut, fin)),
  )
  const connus = gains.filter((g): g is number => g !== null)
  return connus.length === 0 ? null : connus.reduce((a, b) => a + b, 0)
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
