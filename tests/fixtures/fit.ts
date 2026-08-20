/**
 * Encodeur FIT minimal, pour fabriquer des fichiers de test.
 *
 * Écrire l'encodeur permet de vérifier que le décodeur suit bien la
 * structure décrite par la spécification — ce qu'il ne prouve pas, c'est
 * qu'un vrai fichier Garmin est conforme à ma lecture de cette
 * spécification. C'est la limite de l'exercice, et elle est assumée : le
 * lecteur n'a jamais vu de fichier de montre réel.
 */

export interface FitRecord {
  /** Secondes depuis l'époque FIT (31/12/1989). */
  timestamp?: number
  /** Degrés ; convertis en semicircles à l'encodage. */
  lat?: number
  lon?: number
  /** Mètres ; convertis à l'échelle FIT ((m + 500) × 5). */
  altitude?: number
}

export interface FitOptions {
  bigEndian?: boolean
  /** Ajoute un champ développeur à la définition, pour tester son saut. */
  developerField?: boolean
  /** Annonce plus de données que le fichier n'en contient. */
  truncate?: boolean
  /** Insère un message d'un autre type (session) avant les enregistrements. */
  withOtherMessage?: boolean
}

const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180

function semicircles(degrees: number): number {
  return Math.round(degrees * SEMICIRCLES_PER_DEGREE)
}

class Writer {
  private readonly bytes: number[] = []

  u8(value: number): void {
    this.bytes.push(value & 0xff)
  }

  u16(value: number, littleEndian: boolean): void {
    const octets = [value & 0xff, (value >> 8) & 0xff]
    this.bytes.push(...(littleEndian ? octets : octets.reverse()))
  }

  u32(value: number, littleEndian: boolean): void {
    const octets = [
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]
    this.bytes.push(...(littleEndian ? octets : octets.reverse()))
  }

  i32(value: number, littleEndian: boolean): void {
    this.u32(value >>> 0, littleEndian)
  }

  ascii(text: string): void {
    for (const char of text) this.u8(char.charCodeAt(0))
  }

  toArray(): number[] {
    return this.bytes
  }
}

/** Fabrique un fichier FIT contenant les enregistrements donnés. */
export function buildFit(
  records: FitRecord[],
  options: FitOptions = {},
): ArrayBuffer {
  const le = !options.bigEndian
  const corps = new Writer()

  if (options.withOtherMessage) {
    // Définition d'un message « session » (18), puis une donnée : le lecteur
    // doit le traverser sans s'y intéresser.
    corps.u8(0x41) // définition, type local 1
    corps.u8(0)
    corps.u8(le ? 0 : 1)
    corps.u16(18, le)
    corps.u8(1)
    corps.u8(253) // timestamp
    corps.u8(4)
    corps.u8(0x86) // uint32
    corps.u8(0x01) // donnée, type local 1
    corps.u32(1_000, le)
  }

  // Définition du message « record » (20) : timestamp, lat, lon, altitude.
  corps.u8(options.developerField ? 0x60 : 0x40) // définition, type local 0
  corps.u8(0)
  corps.u8(le ? 0 : 1)
  corps.u16(20, le)
  corps.u8(4)
  corps.u8(253)
  corps.u8(4)
  corps.u8(0x86) // uint32
  corps.u8(0)
  corps.u8(4)
  corps.u8(0x85) // sint32
  corps.u8(1)
  corps.u8(4)
  corps.u8(0x85) // sint32
  corps.u8(2)
  corps.u8(2)
  corps.u8(0x84) // uint16
  if (options.developerField) {
    corps.u8(1) // un champ développeur
    corps.u8(0) // numéro
    corps.u8(2) // taille
    corps.u8(0) // index de données développeur
  }

  for (const record of records) {
    corps.u8(0x00) // donnée, type local 0
    corps.u32(record.timestamp ?? 0xffffffff, le)
    corps.i32(
      record.lat === undefined ? 0x7fffffff : semicircles(record.lat),
      le,
    )
    corps.i32(
      record.lon === undefined ? 0x7fffffff : semicircles(record.lon),
      le,
    )
    corps.u16(
      record.altitude === undefined
        ? 0xffff
        : Math.round((record.altitude + 500) * 5),
      le,
    )
    if (options.developerField) corps.u16(0, le)
  }

  const donnees = corps.toArray()
  const entete = new Writer()
  entete.u8(12)
  entete.u8(0x20)
  entete.u16(2140, true)
  entete.u32(options.truncate ? donnees.length + 64 : donnees.length, true)
  entete.ascii('.FIT')

  const tout = Uint8Array.from([...entete.toArray(), ...donnees])
  return tout.buffer
}

/** Fichier qui n'est pas un FIT du tout. */
export function notAFit(): ArrayBuffer {
  return Uint8Array.from(
    'ceci est un fichier texte'.split('').map((c) => c.charCodeAt(0)),
  ).buffer
}
