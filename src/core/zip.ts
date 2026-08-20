/**
 * Lecture d'archives ZIP, sans dépendance.
 *
 * C'est la réponse à « prévoir un connecteur Strava ? » (issue #89). L'API
 * Strava impose un `client_secret`, qui ne peut pas vivre dans une
 * application statique sans être publié — il faudrait un serveur, donc un
 * compte, donc des traces qui transitent ailleurs que sur l'appareil. La
 * promesse du produit tomberait. Strava, Garmin, Suunto et Polar permettent
 * en revanche d'exporter *toutes* ses activités en archive : l'utilisateur
 * la dépose, et rien ne sort du navigateur.
 *
 * Le format se lit à la main : un répertoire central en fin de fichier liste
 * les entrées, chacune précédée d'un en-tête local. La décompression est
 * confiée à `DecompressionStream`, présent dans tous les navigateurs
 * modernes — aucune bibliothèque à embarquer ni à maintenir.
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

const SIGNATURE_LOCALE = 0x04034b50
const SIGNATURE_CENTRALE = 0x02014b50
const SIGNATURE_FIN = 0x06054b50

/** Taille minimale de l'en-tête de fin, hors commentaire. */
const TAILLE_FIN = 22

/** Longueur maximale du commentaire d'archive, à balayer pour trouver la fin. */
const COMMENTAIRE_MAX = 0xffff

export interface ZipEntry {
  name: string
  /** 0 = stocké tel quel, 8 = deflate brut. */
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

/** Vrai si les quatre premiers octets sont la signature d'un en-tête local. */
export function looksLikeZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  return new DataView(buffer).getUint32(0, true) === SIGNATURE_LOCALE
}

/**
 * Position de l'en-tête de fin, cherchée depuis la fin : un commentaire
 * d'archive peut le précéder de plusieurs dizaines de kilo-octets.
 */
function trouverFin(vue: DataView): number {
  const debut = Math.max(0, vue.byteLength - TAILLE_FIN - COMMENTAIRE_MAX)
  for (let position = vue.byteLength - TAILLE_FIN; position >= debut; position -= 1) {
    if (vue.getUint32(position, true) === SIGNATURE_FIN) return position
  }
  throw new ZipError(
    'Ce fichier n’est pas une archive ZIP lisible (fin d’archive introuvable).',
  )
}

export function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const vue = new DataView(buffer)
  const fin = trouverFin(vue)

  const nombre = vue.getUint16(fin + 10, true)
  const debutCentral = vue.getUint32(fin + 16, true)
  // Ces sentinelles signalent un en-tête Zip64, que ce lecteur ne connaît
  // pas : au-delà de 65 535 entrées ou de 4 Go, les vraies valeurs vivent
  // ailleurs. Le dire vaut mieux que lire l'archive de travers.
  if (nombre === 0xffff || debutCentral === 0xffffffff) {
    throw new ZipError(
      'Archive trop volumineuse pour être lue ici (format Zip64) : extrayez-la puis déposez les fichiers.',
    )
  }

  const entrees: ZipEntry[] = []
  let position = debutCentral
  for (let index = 0; index < nombre; index += 1) {
    if (position + 46 > vue.byteLength) {
      throw new ZipError('Archive ZIP incomplète : le répertoire est tronqué.')
    }
    if (vue.getUint32(position, true) !== SIGNATURE_CENTRALE) {
      throw new ZipError('Archive ZIP illisible : répertoire central corrompu.')
    }
    const tailleNom = vue.getUint16(position + 28, true)
    const tailleExtra = vue.getUint16(position + 30, true)
    const tailleCommentaire = vue.getUint16(position + 32, true)
    entrees.push({
      name: new TextDecoder().decode(
        new Uint8Array(buffer, position + 46, tailleNom),
      ),
      method: vue.getUint16(position + 10, true),
      compressedSize: vue.getUint32(position + 20, true),
      uncompressedSize: vue.getUint32(position + 24, true),
      localHeaderOffset: vue.getUint32(position + 42, true),
    })
    position += 46 + tailleNom + tailleExtra + tailleCommentaire
  }
  return entrees
}

/** Rassemble les morceaux d'un flux en un seul tableau d'octets. */
async function collecter(
  flux: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const lecteur = flux.getReader()
  const morceaux: Uint8Array[] = []
  let taille = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value)
    taille += value.byteLength
  }
  const entier = new Uint8Array(taille)
  let position = 0
  for (const morceau of morceaux) {
    entier.set(morceau, position)
    position += morceau.byteLength
  }
  return entier
}

async function decompresser(
  source: Uint8Array,
  format: 'deflate-raw' | 'gzip',
): Promise<Uint8Array> {
  // Un ReadableStream construit à la main plutôt qu'un Blob : jsdom, où
  // tournent les tests du store, ne fournit pas `Blob.stream()`.
  const entree = new ReadableStream<BufferSource>({
    start(controller) {
      // Copie explicite : le type BufferSource des flux de compression exige
      // un tableau adossé à un ArrayBuffer, pas à une vue partagée.
      controller.enqueue(new Uint8Array(source))
      controller.close()
    },
  })
  return collecter(entree.pipeThrough(new DecompressionStream(format)))
}

export async function readZipEntry(
  buffer: ArrayBuffer,
  entry: ZipEntry,
): Promise<Uint8Array> {
  const vue = new DataView(buffer)
  const debut = entry.localHeaderOffset
  if (debut + 30 > buffer.byteLength) {
    throw new ZipError(`Archive ZIP incomplète : « ${entry.name} » manque.`)
  }
  if (vue.getUint32(debut, true) !== SIGNATURE_LOCALE) {
    throw new ZipError(`Archive ZIP illisible à l’entrée « ${entry.name} ».`)
  }
  // Les longueurs de nom et d'extra de l'en-tête local peuvent différer de
  // celles du répertoire central : ce sont celles-ci qui donnent le début
  // réel des données.
  const tailleNom = vue.getUint16(debut + 26, true)
  const tailleExtra = vue.getUint16(debut + 28, true)
  const donnees = debut + 30 + tailleNom + tailleExtra
  if (donnees + entry.compressedSize > buffer.byteLength) {
    throw new ZipError(`Archive ZIP incomplète : « ${entry.name} » est tronqué.`)
  }
  const brut = new Uint8Array(buffer, donnees, entry.compressedSize)

  let contenu: Uint8Array
  if (entry.method === 0) contenu = new Uint8Array(brut)
  else if (entry.method === 8) contenu = await decompresser(brut, 'deflate-raw')
  else {
    throw new ZipError(
      `« ${entry.name} » utilise une compression non prise en charge.`,
    )
  }

  // Les archives Strava contiennent des `.gpx.gz` : le ZIP les stocke tels
  // quels, la compression est à l'intérieur.
  return entry.name.toLowerCase().endsWith('.gz')
    ? decompresser(contenu, 'gzip')
    : contenu
}

const EXTENSIONS_TRACE = ['.gpx', '.fit', '.tcx', '.gpx.gz', '.tcx.gz']

/**
 * Ne garde que ce qui peut contenir une trace.
 *
 * Une archive Strava contient aussi des CSV, des photos, des dossiers et,
 * sur macOS, un `__MACOSX` de métadonnées. Rien de tout cela n'est une
 * erreur d'import : ce sont des fichiers qui ne nous concernent pas.
 */
export function entreesDeTrace(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter((entry) => {
    const nom = entry.name.toLowerCase()
    if (nom.endsWith('/')) return false
    if (nom.startsWith('__macosx/') || nom.includes('/._')) return false
    return EXTENSIONS_TRACE.some((extension) => nom.endsWith(extension))
  })
}
