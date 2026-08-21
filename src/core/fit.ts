import { estDansLeMonde } from './coordonnees.ts'
import type { LonLat } from './types.ts'

/**
 * Lecture des fichiers FIT (montres Garmin, Suunto, Coros, Wahoo…).
 *
 * La plupart des montres GPS produisent nativement du FIT ; exiger une
 * conversion en GPX ajoute une friction là où elle coûte le plus cher — sur
 * le public qui a justement du matériel. Le format est binaire mais simple :
 * un en-tête, puis une suite d'enregistrements, chacun précédé d'un octet
 * qui dit ce qu'il est.
 *
 * Ce lecteur ne cherche que ce dont l'application a besoin : les messages
 * « record » (numéro global 20) et, dedans, la position, l'altitude et
 * l'horodatage. Tout le reste — fréquence cardiaque, puissance, tours,
 * champs développeur — est traversé sans être interprété.
 *
 * Références : la disposition de l'en-tête d'enregistrement est celle du
 * décodeur `polyvertex/fitdecode` (bit 7 = horodatage compressé, bit 6 =
 * message de définition), et non celle de certains résumés qui inversent
 * ces deux bits.
 */

/** Erreur de lecture d'un FIT, message affichable tel quel à l'utilisateur. */
export class FitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FitError'
  }
}

export interface ParsedFit {
  points: LonLat[]
  /** Altitudes alignées sur les points (null quand l'enregistrement n'en a pas). */
  elevations: (number | null)[]
  /** Date du premier enregistrement horodaté (ISO), sinon null. */
  date: string | null
  /** Nombre de positions écartées parce qu'elles tombaient hors du monde (issue #167). */
  pointsHorsLimites: number
  /**
   * Horodatage de chaque point, en millisecondes depuis l'époque Unix,
   * aligné sur `points` (issue #149).
   */
  times: (number | null)[]
  /** Toujours `null` : le FIT ne rapporte pas de HDOP. */
  hdops: null
  /** Précision GPS en mètres, alignée sur `points`. */
  precisionsMetres: (number | null)[]
}

/** L'époque FIT : 31 décembre 1989 à minuit UTC, en secondes Unix. */
export const FIT_EPOCH_SECONDS = 631_065_600

/** Numéro du message global « record », celui qui porte les points de trace. */
const RECORD_MESSAGE = 20

/** Numéros de champ utiles dans un message « record ». */
const FIELD_POSITION_LAT = 0
const FIELD_POSITION_LONG = 1
const FIELD_ALTITUDE = 2
const FIELD_TIMESTAMP = 253
const FIELD_ENHANCED_ALTITUDE = 78
/**
 * Précision GPS du profil FIT, en **mètres** — et non un HDOP, qui est sans
 * dimension. L'issue #149 supposait que le FIT portait un hdop ; il porte
 * autre chose, et convertir l'un en l'autre demanderait un facteur que
 * personne n'a mesuré ici (issue #149).
 */
const FIELD_GPS_ACCURACY = 31
/** Valeur « champ absent » du profil FIT pour un entier 8 bits non signé. */
const UINT8_ABSENT = 0xff

/** Un semicircle vaut 180 / 2^31 degrés. */
const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31

/**
 * Valeur « champ absent » du FIT pour un entier 32 bits signé. Une montre
 * qui enregistre avant d'avoir fixé les satellites écrit ceci plutôt que
 * d'omettre le champ : ce n'est pas une position aberrante, c'est une
 * absence de position, et elle ne se signale pas à l'utilisateur.
 */
const SEMICIRCLE_ABSENT = 0x7fffffff

/** Les altitudes FIT sont stockées en (mètres + 500) × 5. */
const ALTITUDE_SCALE = 5
const ALTITUDE_OFFSET = 500

interface FieldDefinition {
  number: number
  size: number
  baseType: number
}

interface MessageDefinition {
  globalNumber: number
  littleEndian: boolean
  fields: FieldDefinition[]
  /** Taille cumulée des champs développeur, à sauter sans les lire. */
  developerBytes: number
}

/** Taille en octets de chaque type de base, indexée par son numéro. */
const BASE_TYPE_SIZES: Record<number, number> = {
  0: 1, // enum
  1: 1, // sint8
  2: 1, // uint8
  3: 2, // sint16
  4: 2, // uint16
  5: 4, // sint32
  6: 4, // uint32
  7: 1, // string
  8: 4, // float32
  9: 8, // float64
  10: 1, // uint8z
  11: 2, // uint16z
  12: 4, // uint32z
  13: 1, // byte
  14: 8, // sint64
  15: 8, // uint64
  16: 8, // uint64z
}

/**
 * Valeur « invalide » de chaque type de base. Le FIT n'omet pas un champ
 * absent : il écrit une sentinelle. La lire comme une donnée transforme une
 * altitude manquante en 12 607 mètres — c'est arrivé, et c'est le genre de
 * valeur qu'on ne remarque que trop tard.
 *
 * Les types dits « z » (uint8z, uint16z, uint32z) utilisent zéro comme
 * sentinelle, les entiers signés leur maximum positif, les non signés tous
 * leurs bits à un.
 */
const INVALID_VALUES: Record<number, number> = {
  0: 0xff, // enum
  1: 0x7f, // sint8
  2: 0xff, // uint8
  3: 0x7fff, // sint16
  4: 0xffff, // uint16
  5: 0x7fffffff, // sint32
  6: 0xffffffff, // uint32
  10: 0, // uint8z
  11: 0, // uint16z
  12: 0, // uint32z
  13: 0xff, // byte
}

/**
 * Lit un champ numérique. Retourne null pour une valeur sentinelle et pour
 * ce que le lecteur ne sait pas interpréter (chaînes, entiers 64 bits) :
 * mieux vaut ignorer une valeur que la deviner.
 */
function readNumber(
  view: DataView,
  offset: number,
  baseType: number,
  littleEndian: boolean,
): number | null {
  const type = baseType & 0x1f
  const brut = readRaw(view, offset, type, littleEndian)
  if (brut === null || Number.isNaN(brut)) return null
  return brut === INVALID_VALUES[type] ? null : brut
}

function readRaw(
  view: DataView,
  offset: number,
  baseType: number,
  littleEndian: boolean,
): number | null {
  switch (baseType & 0x1f) {
    case 0:
    case 2:
    case 10:
    case 13:
      return view.getUint8(offset)
    case 1:
      return view.getInt8(offset)
    case 3:
      return view.getInt16(offset, littleEndian)
    case 4:
    case 11:
      return view.getUint16(offset, littleEndian)
    case 5:
      return view.getInt32(offset, littleEndian)
    case 6:
    case 12:
      return view.getUint32(offset, littleEndian)
    case 8:
      return view.getFloat32(offset, littleEndian)
    case 9:
      return view.getFloat64(offset, littleEndian)
    default:
      return null
  }
}

/** Vrai si le tampon commence par un en-tête FIT (signature « .FIT »). */
export function looksLikeFit(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  const bytes = new Uint8Array(buffer, 8, 4)
  return (
    bytes[0] === 0x2e && // .
    bytes[1] === 0x46 && // F
    bytes[2] === 0x49 && // I
    bytes[3] === 0x54 // T
  )
}

function altitudeFrom(raw: number): number {
  return raw / ALTITUDE_SCALE - ALTITUDE_OFFSET
}

/**
 * Lit un fichier FIT et en extrait la trace. Lève une FitError en français
 * si le fichier n'en est pas un ou s'il est incomplet.
 */
export function parseFit(buffer: ArrayBuffer): ParsedFit {
  if (!looksLikeFit(buffer)) {
    throw new FitError(
      'Ce fichier n’est pas un FIT (signature absente). Vérifiez qu’il s’agit bien d’un export de montre.',
    )
  }
  const view = new DataView(buffer)
  const headerSize = view.getUint8(0)
  const dataSize = view.getUint32(4, true)
  const fin = headerSize + dataSize
  if (fin > buffer.byteLength) {
    // Le CRC final n'est volontairement pas vérifié (voir l'en-tête du
    // module) ; en revanche, une taille annoncée plus grande que le fichier
    // signe un téléchargement interrompu, et ça se dit.
    throw new FitError(
      'Ce fichier FIT est incomplet : il annonce plus de données qu’il n’en contient (téléchargement interrompu ?).',
    )
  }

  const definitions = new Map<number, MessageDefinition>()
  const points: LonLat[] = []
  const times: (number | null)[] = []
  const precisionsMetres: (number | null)[] = []
  let pointsHorsLimites = 0
  const elevations: (number | null)[] = []
  let date: string | null = null

  let offset = headerSize
  while (offset < fin) {
    const header = view.getUint8(offset)
    offset += 1

    // Bit 7 : en-tête à horodatage compressé — c'est un message de données,
    // dont le type local tient sur les bits 5-6.
    const compresse = (header & 0x80) !== 0
    const definition = (header & 0x40) !== 0 && !compresse
    const localType = compresse ? (header >> 5) & 0x03 : header & 0x0f

    if (definition) {
      if (offset + 5 > fin) break
      const littleEndian = view.getUint8(offset + 1) === 0
      const globalNumber = view.getUint16(offset + 2, littleEndian)
      const fieldCount = view.getUint8(offset + 4)
      offset += 5
      const fields: FieldDefinition[] = []
      for (let i = 0; i < fieldCount; i++) {
        if (offset + 3 > fin) return finish(points, elevations, date, pointsHorsLimites, times, precisionsMetres)
        fields.push({
          number: view.getUint8(offset),
          size: view.getUint8(offset + 1),
          baseType: view.getUint8(offset + 2),
        })
        offset += 3
      }
      // Champs développeur : on ne les lit pas, mais il faut connaître leur
      // taille pour ne pas se désynchroniser sur les messages suivants.
      let developerBytes = 0
      if ((header & 0x20) !== 0) {
        if (offset >= fin) break
        const devCount = view.getUint8(offset)
        offset += 1
        for (let i = 0; i < devCount; i++) {
          if (offset + 3 > fin) return finish(points, elevations, date, pointsHorsLimites, times, precisionsMetres)
          developerBytes += view.getUint8(offset + 1)
          offset += 3
        }
      }
      definitions.set(localType, {
        globalNumber,
        littleEndian,
        fields,
        developerBytes,
      })
      continue
    }

    const def = definitions.get(localType)
    if (!def) {
      // Message de données sans définition connue : impossible de savoir
      // combien d'octets il occupe, donc impossible de continuer sans
      // inventer. On s'arrête sur ce qu'on a lu.
      break
    }

    let lat: number | null = null
    let lon: number | null = null
    let altitude: number | null = null
    let horodatage: number | null = null
    let precision: number | null = null
    let champOffset = offset
    for (const field of def.fields) {
      if (champOffset + field.size > fin) return finish(points, elevations, date, pointsHorsLimites, times, precisionsMetres)
      if (def.globalNumber === RECORD_MESSAGE) {
        const taille = BASE_TYPE_SIZES[field.baseType & 0x1f] ?? field.size
        // Un champ peut contenir un tableau : on ne lit que la première
        // valeur, la taille déclarée fait foi pour l'avancement.
        const valeur =
          field.size >= taille
            ? readNumber(view, champOffset, field.baseType, def.littleEndian)
            : null
        if (valeur !== null) {
          if (field.number === FIELD_POSITION_LAT) lat = valeur
          else if (field.number === FIELD_POSITION_LONG) lon = valeur
          else if (field.number === FIELD_ALTITUDE && altitude === null) {
            altitude = altitudeFrom(valeur)
          } else if (field.number === FIELD_ENHANCED_ALTITUDE) {
            altitude = altitudeFrom(valeur)
          } else if (field.number === FIELD_TIMESTAMP) {
            horodatage = (valeur + FIT_EPOCH_SECONDS) * 1_000
            date ??= new Date(horodatage).toISOString()
          } else if (field.number === FIELD_GPS_ACCURACY) {
            precision = valeur === UINT8_ABSENT ? null : valeur
          }
        }
      }
      champOffset += field.size
    }
    offset = champOffset + def.developerBytes

    if (
      def.globalNumber === RECORD_MESSAGE &&
      lat !== null &&
      lon !== null &&
      // Les deux façons dont une montre dit « je ne savais pas où j'étais » :
      // le champ marqué absent, et le 0/0 du premier enregistrement. Aucune
      // des deux n'est une anomalie à rapporter (issue #167).
      lat !== SEMICIRCLE_ABSENT &&
      lon !== SEMICIRCLE_ABSENT &&
      !(lat === 0 && lon === 0)
    ) {
      const latDeg = lat * SEMICIRCLE_TO_DEGREES
      const lonDeg = lon * SEMICIRCLE_TO_DEGREES
      if (estDansLeMonde(lonDeg, latDeg)) {
        points.push([lonDeg, latDeg])
        elevations.push(altitude)
        // Les quatre tableaux avancent ensemble : un enregistrement sans fix
        // ne doit pas décaler l'horodatage du premier point localisé.
        times.push(horodatage)
        precisionsMetres.push(precision)
      } else {
        // Une position hors bornes qui n'est pas une sentinelle connue : le
        // fichier est abîmé, et l'utilisateur mérite de l'apprendre.
        pointsHorsLimites += 1
      }
    }
  }

  return finish(points, elevations, date, pointsHorsLimites, times, precisionsMetres)
}

function finish(
  points: LonLat[],
  elevations: (number | null)[],
  date: string | null,
  pointsHorsLimites: number,
  times: (number | null)[],
  precisionsMetres: (number | null)[],
): ParsedFit {
  return {
    points,
    elevations,
    date,
    pointsHorsLimites,
    times,
    // Le FIT ne rapporte pas de HDOP — il rapporte une précision en mètres,
    // qui est autre chose. `null` le dit ; un tableau de `null` laisserait
    // croire que la mesure existe et manque (#149).
    hdops: null,
    precisionsMetres,
  }
}
