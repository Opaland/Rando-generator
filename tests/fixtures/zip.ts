/**
 * Fabrique d'archives ZIP minimales pour les tests.
 *
 * Écrite à la main plutôt qu'apportée par une dépendance : le lecteur testé
 * l'est aussi, et faire dépendre l'un de l'autre d'une même bibliothèque
 * masquerait justement les désaccords d'interprétation du format.
 */

export interface EntreeZip {
  nom: string
  contenu: Uint8Array | string
  /** 0 = stocké tel quel, 8 = deflate brut ; un autre nombre est écrit tel quel. */
  methode?: number
  /**
   * Octets d'« extra » dans l'en-tête local et dans le répertoire central.
   * Les vraies archives en portent presque toujours (horodatages étendus,
   * attributs Unix), et pas forcément autant des deux côtés.
   */
  extraLocal?: number
  extraCentral?: number
  /** Commentaire de l'entrée, dans le répertoire central. */
  commentaire?: string
  /** Taille décompressée annoncée, quand elle doit mentir. */
  tailleAnnoncee?: number
}

export interface OptionsZip {
  /** Commentaire d'archive, après l'en-tête de fin (65 535 octets au plus). */
  commentaire?: string
}

function octets(contenu: Uint8Array | string): Uint8Array {
  return typeof contenu === 'string'
    ? new TextEncoder().encode(contenu)
    : contenu
}

/** Blob.stream() manque dans jsdom : on construit le flux à la main. */
async function comprimerEn(
  source: Uint8Array,
  format: 'deflate-raw' | 'gzip',
): Promise<Uint8Array> {
  const entree = new ReadableStream<BufferSource>({
    start(controller) {
      // Copie explicite : le type BufferSource des flux de compression exige
      // un tableau adossé à un ArrayBuffer, pas à une vue partagée.
      controller.enqueue(new Uint8Array(source))
      controller.close()
    },
  })
  const lecteur = entree.pipeThrough(new CompressionStream(format)).getReader()
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

async function comprimer(source: Uint8Array): Promise<Uint8Array> {
  return comprimerEn(source, 'deflate-raw')
}

/** Compresse en gzip — le format des `.gpx.gz` des archives Strava. */
export async function gzip(contenu: string): Promise<Uint8Array> {
  return comprimerEn(octets(contenu), 'gzip')
}

interface Assemblee {
  local: Uint8Array
  central: Uint8Array
}

async function assembler(
  entree: EntreeZip,
  offset: number,
): Promise<Assemblee> {
  const nom = new TextEncoder().encode(entree.nom)
  const brut = octets(entree.contenu)
  const methode = entree.methode ?? 8
  const donnees = methode === 8 ? await comprimer(brut) : brut
  const extraLocal = entree.extraLocal ?? 0
  const extraCentral = entree.extraCentral ?? 0
  const commentaire = new TextEncoder().encode(entree.commentaire ?? '')
  const tailleAnnoncee = entree.tailleAnnoncee ?? brut.length

  const local = new DataView(
    new ArrayBuffer(30 + nom.length + extraLocal + donnees.length),
  )
  local.setUint32(0, 0x04034b50, true)
  local.setUint16(4, 20, true) // version minimale
  local.setUint16(6, 0x0800, true) // noms en UTF-8
  local.setUint16(8, methode, true)
  local.setUint32(14, 0, true) // CRC laissé à zéro : le lecteur ne s'en sert pas
  local.setUint32(18, donnees.length, true)
  local.setUint32(22, tailleAnnoncee, true)
  local.setUint16(26, nom.length, true)
  local.setUint16(28, extraLocal, true)
  const localOctets = new Uint8Array(local.buffer)
  localOctets.set(nom, 30)
  // L'extra est laissé à zéro : seule sa longueur compte pour le lecteur.
  localOctets.set(donnees, 30 + nom.length + extraLocal)

  const central = new DataView(
    new ArrayBuffer(46 + nom.length + extraCentral + commentaire.length),
  )
  central.setUint32(0, 0x02014b50, true)
  central.setUint16(4, 20, true)
  central.setUint16(6, 20, true)
  central.setUint16(8, 0x0800, true)
  central.setUint16(10, methode, true)
  central.setUint32(16, 0, true)
  central.setUint32(20, donnees.length, true)
  central.setUint32(24, tailleAnnoncee, true)
  central.setUint16(28, nom.length, true)
  central.setUint16(30, extraCentral, true)
  central.setUint16(32, commentaire.length, true)
  central.setUint32(42, offset, true)
  const centralOctets = new Uint8Array(central.buffer)
  centralOctets.set(nom, 46)
  centralOctets.set(commentaire, 46 + nom.length + extraCentral)

  return { local: localOctets, central: centralOctets }
}

/** Construit une archive ZIP complète (en-têtes locaux + répertoire central). */
export async function buildZip(
  entrees: EntreeZip[],
  options: OptionsZip = {},
): Promise<ArrayBuffer> {
  const assemblees: Assemblee[] = []
  let offset = 0
  for (const entree of entrees) {
    const assemblee = await assembler(entree, offset)
    assemblees.push(assemblee)
    offset += assemblee.local.length
  }

  const tailleCentral = assemblees.reduce((t, a) => t + a.central.length, 0)
  const commentaire = new TextEncoder().encode(options.commentaire ?? '')
  const fin = new DataView(new ArrayBuffer(22 + commentaire.length))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, assemblees.length, true)
  fin.setUint16(10, assemblees.length, true)
  fin.setUint32(12, tailleCentral, true)
  fin.setUint32(16, offset, true)
  fin.setUint16(20, commentaire.length, true)
  new Uint8Array(fin.buffer).set(commentaire, 22)

  const total = offset + tailleCentral + 22 + commentaire.length
  const archive = new Uint8Array(total)
  let position = 0
  for (const a of assemblees) {
    archive.set(a.local, position)
    position += a.local.length
  }
  for (const a of assemblees) {
    archive.set(a.central, position)
    position += a.central.length
  }
  archive.set(new Uint8Array(fin.buffer), position)
  return archive.buffer
}

/** Une archive dont l'en-tête de fin annonce un nombre d'entrées Zip64. */
export async function buildZipTropGrand(): Promise<ArrayBuffer> {
  const archive = new Uint8Array(await buildZip([{ nom: 'a.gpx', contenu: 'x' }]))
  const vue = new DataView(archive.buffer)
  vue.setUint16(archive.length - 22 + 10, 0xffff, true)
  return archive.buffer
}
