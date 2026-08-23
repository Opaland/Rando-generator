import type { ParcoursDeclare } from './declaratif.ts'
import { traverseAntimeridien } from './domaine.ts'
import { trackFingerprint } from './gpx.ts'
import type { Itinerary, LonLat, Track } from './types.ts'

/**
 * Sauvegarde complète, exportable et réimportable (issue #132).
 *
 * Tout vit dans l'IndexedDB du navigateur : rien ne suit d'un appareil à
 * l'autre, et vider les données du site efface des années de traces. C'est le
 * prix du « vos traces ne quittent jamais votre navigateur », et c'est le bon
 * prix — à condition de laisser une porte de sortie manuelle plutôt qu'un
 * compte et une synchronisation serveur.
 *
 * Le fichier est un JSON gzippé. JSON parce qu'il reste lisible et réparable
 * à la main dix ans plus tard ; gzippé parce qu'une trace est un long texte
 * de coordonnées, qui se réduit d'un ordre de grandeur.
 */

/** Erreur de sauvegarde, message affichable tel quel à l'utilisateur. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

export const BACKUP_FORMAT = 'sentiers-sauvegarde'
export const BACKUP_VERSION = 1

export interface BackupReglages {
  toleranceMeters?: number
  completionPct?: number
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  tracks: Track[]
  customItineraries: Itinerary[]
  settings: BackupReglages
  /**
   * Les itinéraires déclarés parcourus (issue #158).
   *
   * Toujours présent en lecture, même pour une sauvegarde écrite avant que
   * cela existe : une liste vide plutôt qu'`undefined`, pour qu'aucun
   * appelant n'ait à s'en souvenir.
   */
  parcoursDeclares: ParcoursDeclare[]
}

/**
 * Ce qui part dans la sauvegarde : ce que l'utilisateur a créé ou importé.
 *
 * Pas les itinéraires téléchargés d'OpenStreetMap : ils se re-téléchargent en
 * un clic, pèsent des mégaoctets, et ne lui appartiennent pas.
 */
export function buildBackup(parts: {
  tracks: Track[]
  customItineraries: Itinerary[]
  settings: BackupReglages
  parcoursDeclares?: ParcoursDeclare[]
  exportedAt: string
}): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: parts.exportedAt,
    tracks: parts.tracks,
    customItineraries: parts.customItineraries,
    settings: parts.settings,
    parcoursDeclares: parts.parcoursDeclares ?? [],
  }
}

export function serialiserBackup(backup: Backup): string {
  return JSON.stringify(backup)
}

/** Nom du fichier téléchargé, daté du jour de l'export. */
export function backupFilename(isoNow: string): string {
  const jour = /^(\d{4}-\d{2}-\d{2})/.exec(isoNow)?.[1]
  return jour
    ? `sauvegarde-sentiers-${jour}.json.gz`
    : 'sauvegarde-sentiers.json.gz'
}

/**
 * Compresse la sauvegarde pour le téléchargement.
 *
 * Une trace, c'est un long texte de coordonnées : gzip le réduit d'un ordre
 * de grandeur, et le fichier reste un JSON qu'on peut décompresser à la main
 * avec n'importe quel outil.
 */
export async function compresserBackup(texte: string): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(texte))
      controller.close()
    },
  })
  return collecter(source.pipeThrough(new CompressionStream('gzip')))
}

async function collecter(flux: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const lecteur = flux.getReader()
  const morceaux: Uint8Array[] = []
  let taille = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    morceaux.push(value)
    taille += value.length
  }
  const sortie = new Uint8Array(taille)
  let offset = 0
  for (const morceau of morceaux) {
    sortie.set(morceau, offset)
    offset += morceau.length
  }
  return sortie
}

function estGzip(octets: Uint8Array): boolean {
  return octets[0] === 0x1f && octets[1] === 0x8b
}

async function degzipper(octets: Uint8Array): Promise<string> {
  // Flux construit à la main : jsdom n'implémente pas Blob.stream(), et on ne
  // veut pas d'une dépendance de décompression pour trois octets d'en-tête.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(octets))
      controller.close()
    },
  })
  const lecteur = source
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader()
  const decodeur = new TextDecoder()
  let texte = ''
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    texte += decodeur.decode(value, { stream: true })
  }
  return texte + decodeur.decode()
}

/**
 * Un fichier de sauvegarde vient du disque : rien n'y est garanti. Tout est
 * relu comme des valeurs inconnues, jamais comme les types du programme —
 * sans quoi le compilateur nous certifierait des formes qu'il n'a pas vues.
 */
function champs(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === 'object' && valeur !== null
    ? (valeur as Record<string, unknown>)
    : null
}

function estPoint(valeur: unknown): boolean {
  return (
    Array.isArray(valeur) &&
    valeur.length === 2 &&
    typeof valeur[0] === 'number' &&
    typeof valeur[1] === 'number'
  )
}

function estTrace(valeur: unknown): valeur is Track {
  const t = champs(valeur)
  if (!t) return false
  const points = t['points']
  return (
    typeof t['id'] === 'string' &&
    typeof t['filename'] === 'string' &&
    Array.isArray(points) &&
    // Une trace sans point ne dit rien et fausserait le compte des sorties.
    points.length > 0 &&
    points.every(estPoint) &&
    /*
      Quatrième chemin par lequel des coordonnées entrent, et le plus facile
      à oublier — c'est déjà `importerSauvegarde` qui manquait à la garde de
      démonstration (CLAUDE.md §4). Une sauvegarde peut venir d'une version
      antérieure à la borne du domaine (#170), ou avoir été modifiée à la
      main : une trace qui franchit ±180° est écartée ici comme elle l'aurait
      été à l'import.
    */
    !traverseAntimeridien(points as LonLat[])
  )
}

/**
 * Un parcours déclaré lisible (issue #158).
 *
 * `date` peut être absente ou nulle — « je ne sais plus quand » est une
 * réponse complète, pas une donnée manquante.
 */
function estParcoursDeclare(valeur: unknown): valeur is ParcoursDeclare {
  const p = champs(valeur)
  if (!p) return false
  const date = p['date']
  return (
    typeof p['itineraryId'] === 'number' &&
    typeof p['declareLe'] === 'string' &&
    (date === null || date === undefined || typeof date === 'string')
  )
}

function estItineraire(valeur: unknown): valeur is Itinerary {
  const i = champs(valeur)
  if (!i) return false
  const ways = i['ways']
  return (
    typeof i['osmRelationId'] === 'number' &&
    Array.isArray(ways) &&
    ways.length > 0 &&
    ways.every((way) => {
      const coords = champs(way)?.['coords']
      // Vérifier chaque coordonnée, pas seulement que `coords` est un
      // tableau : un `null` glissé là se propageait jusqu'au calcul de
      // longueur et au rendu de la carte, très loin d'ici (issue #166).
      return Array.isArray(coords) && coords.length > 0 && coords.every(estPoint)
    })
  )
}

/**
 * Relit une sauvegarde, compressée ou non.
 *
 * On accepte les deux formes : le fichier téléchargé est gzippé, mais
 * quelqu'un qui l'a décompressé pour regarder dedans doit pouvoir le
 * réimporter tel quel.
 */
export async function lireArchiveBackup(
  source: string | Uint8Array | ArrayBuffer,
): Promise<Backup> {
  let texte: string
  if (typeof source === 'string') {
    texte = source
  } else {
    const octets =
      source instanceof Uint8Array ? source : new Uint8Array(source)
    texte = estGzip(octets)
      ? await degzipper(octets)
      : new TextDecoder().decode(octets)
  }

  let donnees: unknown
  try {
    donnees = JSON.parse(texte)
  } catch {
    throw new BackupError(
      'Ce fichier n’est pas une sauvegarde Sentiers : son contenu est illisible.',
    )
  }

  const brut = champs(donnees)
  if (!brut) {
    throw new BackupError('Ce fichier n’est pas une sauvegarde Sentiers.')
  }
  if (brut['format'] !== BACKUP_FORMAT) {
    throw new BackupError(
      'Ce fichier n’est pas une sauvegarde Sentiers. Choisissez le fichier ' +
        '« sauvegarde-sentiers-….json.gz » produit par « Enregistrer une sauvegarde ».',
    )
  }
  const version = brut['version']
  if (typeof version !== 'number' || version > BACKUP_VERSION) {
    throw new BackupError(
      'Cette sauvegarde a été écrite par une version plus récente de Sentiers ' +
        `(version ${String(version)}). Mettez l’application à jour, puis réessayez.`,
    )
  }

  const reglages = champs(brut['settings'])
  const nombre = (cle: string): number | undefined => {
    const valeur = reglages?.[cle]
    return typeof valeur === 'number' ? valeur : undefined
  }
  const tracks = brut['tracks']
  const persos = brut['customItineraries']
  const declares = brut['parcoursDeclares']
  const exportedAt = brut['exportedAt']

  return {
    format: BACKUP_FORMAT,
    version,
    exportedAt: typeof exportedAt === 'string' ? exportedAt : '',
    // Une entrée abîmée est écartée, pas fatale : mieux vaut récupérer
    // quatre-vingt-dix-neuf traces sur cent que zéro.
    tracks: Array.isArray(tracks) ? tracks.filter(estTrace) : [],
    customItineraries: Array.isArray(persos)
      ? persos.filter(estItineraire)
      : [],
    // Absent des sauvegardes antérieures à #158 : liste vide, jamais
    // `undefined`, pour qu'aucun appelant n'ait à s'en souvenir.
    parcoursDeclares: Array.isArray(declares)
      ? declares.filter(estParcoursDeclare).map((d) => ({
          itineraryId: d.itineraryId,
          date: d.date ?? null,
          declareLe: d.declareLe,
        }))
      : [],
    settings: {
      ...(nombre('toleranceMeters') !== undefined
        ? { toleranceMeters: nombre('toleranceMeters') as number }
        : {}),
      ...(nombre('completionPct') !== undefined
        ? { completionPct: nombre('completionPct') as number }
        : {}),
    },
  }
}

export interface FusionTraces {
  tracks: Track[]
  ajoutees: number
  ignorees: number
}

/**
 * Fusionne, ne remplace jamais.
 *
 * Un import qui écrase est un import qu'on ne peut pas essayer : la même
 * empreinte de tracé est ignorée (c'est la même sortie), un identifiant déjà
 * pris par un contenu différent reçoit un nouvel identifiant.
 */
export function fusionnerTraces(
  existantes: Track[],
  entrantes: Track[],
): FusionTraces {
  const empreintes = new Set(existantes.map((t) => trackFingerprint(t.points)))
  const ids = new Set(existantes.map((t) => t.id))
  const tracks = [...existantes]
  let ajoutees = 0
  let ignorees = 0
  for (const entrante of entrantes) {
    const empreinte = trackFingerprint(entrante.points)
    if (empreintes.has(empreinte)) {
      ignorees += 1
      continue
    }
    empreintes.add(empreinte)
    const id = ids.has(entrante.id) ? `${entrante.id}-importee` : entrante.id
    ids.add(id)
    tracks.push({ ...entrante, id })
    ajoutees += 1
  }
  return { tracks, ajoutees, ignorees }
}

export interface FusionItineraires {
  itineraries: Itinerary[]
  ajoutes: number
  ignores: number
}

/** Signature de contenu d'un itinéraire perso, indépendante de son numéro. */
function signature(itineraire: Itinerary): string {
  const points = itineraire.ways.flatMap((way) => way.coords)
  const premier = points[0]
  const dernier = points[points.length - 1]
  return [
    itineraire.name ?? '',
    points.length,
    premier ? `${premier[0].toFixed(6)},${premier[1].toFixed(6)}` : '∅',
    dernier ? `${dernier[0].toFixed(6)},${dernier[1].toFixed(6)}` : '∅',
  ].join('|')
}

/**
 * Fusionne les itinéraires personnels.
 *
 * Leurs numéros sont attribués localement (−1, −2, …) : deux appareils
 * donnent le même à deux itinéraires différents. Sans renumérotation, l'import
 * écraserait celui de l'appareil d'accueil — et ses ways avec, puisqu'ils
 * dérivent du numéro de l'itinéraire.
 */
export function fusionnerItineraires(
  existants: Itinerary[],
  entrants: Itinerary[],
): FusionItineraires {
  const signatures = new Set(existants.map(signature))
  const ids = new Set(existants.map((i) => i.osmRelationId))
  const itineraries = [...existants]
  let prochainId = Math.min(0, ...ids)
  let ajoutes = 0
  let ignores = 0
  for (const entrant of entrants) {
    if (signatures.has(signature(entrant))) {
      ignores += 1
      continue
    }
    signatures.add(signature(entrant))
    if (!ids.has(entrant.osmRelationId)) {
      ids.add(entrant.osmRelationId)
      prochainId = Math.min(prochainId, entrant.osmRelationId)
      itineraries.push(entrant)
    } else {
      prochainId -= 1
      const id = prochainId
      ids.add(id)
      itineraries.push({
        ...entrant,
        osmRelationId: id,
        ways: entrant.ways.map((way, index) => ({
          ...way,
          osmWayId: id * 1_000 - index,
        })),
      })
    }
    ajoutes += 1
  }
  return { itineraries, ajoutes, ignores }
}

/**
 * Compte rendu d'un import, en français et au singulier près.
 *
 * « 12 traces ajoutées, 3 déjà présentes » : ce qui a été ignoré compte
 * autant que ce qui est entré, sans quoi l'utilisateur se demande où sont
 * passées ses sorties.
 */
export function resumeFusion(
  traces: FusionTraces,
  itineraires: FusionItineraires,
): string {
  const morceaux: string[] = []
  if (traces.ajoutees > 0) {
    morceaux.push(
      traces.ajoutees === 1 ? '1 trace ajoutée' : `${traces.ajoutees} traces ajoutées`,
    )
  }
  if (itineraires.ajoutes > 0) {
    morceaux.push(
      itineraires.ajoutes === 1
        ? '1 itinéraire ajouté'
        : `${itineraires.ajoutes} itinéraires ajoutés`,
    )
  }
  const dejaLa = traces.ignorees + itineraires.ignores
  if (dejaLa > 0) {
    morceaux.push(dejaLa === 1 ? '1 déjà présent' : `${dejaLa} déjà présents`)
  }
  if (morceaux.length === 0) return 'Cette sauvegarde ne contenait rien de nouveau.'
  return `${morceaux.join(', ')}.`
}
