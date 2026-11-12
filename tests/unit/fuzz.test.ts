// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { parseGpx, GpxError, elevationGainMeters } from '../../src/core/gpx.ts'
import { parseTcx, TcxError } from '../../src/core/tcx.ts'
import { parseFit, FitError } from '../../src/core/fit.ts'
import { GeoJsonError, parseGeoJsonTrails, sourceDeclaree } from '../../src/core/geojson.ts'
import { BACKUP_FORMAT, BACKUP_VERSION, BackupError, lireArchiveBackup } from '../../src/core/backup.ts'
import { lignesDuShapefile } from '../../src/core/shapefile.ts'
import { lireObjectifs } from '../../src/store/trancheObjectifs.ts'
import { COMPLETION_CHOICES, normalizeCompletionPct } from '../../src/core/milestones.ts'
import { lireDrapeau } from '../../src/core/affichage.ts'
import { lireTolerance, TOLERANCE_MAX, TOLERANCE_MIN } from '../../src/core/tolerance.ts'
import { isWgs84Coordinate } from '../../src/core/geo.ts'

/**
 * Issue #670 — les fichiers que Sentiers n'a pas écrits, éprouvés sur des
 * valeurs générées et non plus seulement choisies à la main.
 *
 * La relecture adverse de #664 avait trouvé une longueur d'enregistrement
 * négative qui faisait boucler sans fin le lecteur de shapefile : aucun test
 * écrit à la main ne l'avait essayée. Modèle : le fuzz du dépôt Netatmo
 * (`web/src/fuzz.test.ts`).
 *
 * ## Les règles du jeu
 *
 * - **Graine fixe.** Chaque cas tire ses valeurs d'un générateur semé par
 *   `(GRAINE, numéro du cas)` : il se rejoue seul, à l'identique, avec
 *   `rejouer(lecteur, cas)`. Un échec affiche les deux.
 * - **Biaisé vers les vraies formes**, pour franchir les premières gardes,
 *   **et vers l'inattendu** : `__proto__`, NaN, 1e308, 1e999 (l'infini
 *   qu'un JSON peut produire), 5 000 caractères, une demi-paire UTF-16, des
 *   types croisés.
 * - **Trois invariants**, partout : aucune exception qui ne soit l'erreur
 *   nommée du lecteur (un `RangeError` de `DataView`, un `TypeError` sur un
 *   `null`, c'est un défaut) ; aucune boucle — **pas** par le délai de
 *   Vitest, qui n'interrompt pas une boucle synchrone (le processus reste
 *   pendu), mais par `sansBoucle` ; aucune valeur hors bornes dans ce qui est rendu — une coordonnée hors du
 *   globe, une altitude infinie, un réglage hors de sa plage.
 */

const GRAINE = 670
const CAS = 250

/** mulberry32 : 32 bits d'état, assez pour du fuzz, rejouable partout. */
function generateur(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Tirage {
  readonly hasard: () => number
  constructor(cas: number) {
    this.hasard = generateur(GRAINE * 1_000_003 + cas)
  }
  entier(min: number, max: number): number {
    return min + Math.floor(this.hasard() * (max - min + 1))
  }
  parmi<T>(liste: readonly T[]): T {
    return liste[Math.floor(this.hasard() * liste.length)] as T
  }
  /** Vrai avec la probabilité `p`. */
  si(p: number): boolean {
    return this.hasard() < p
  }
}

const TEXTES_ETRANGES = [
  '',
  ' ',
  'NaN',
  'Infinity',
  '-Infinity',
  '1e308',
  '-1e308',
  '1e999',
  '4.9e-324',
  '-0',
  '0x1F',
  '45,2',
  ' 45.2 ',
  '١٢',
  'abc',
  'x'.repeat(5000),
  '\uD800',
  'é\uDC00',
  '__proto__',
  'constructor',
  '91',
  '-181',
  '180',
  '-90',
  '2026-02-30T25:61:00Z',
  '9999999999999',
] as const

const VALEURS_ETRANGES: readonly unknown[] = [
  null,
  true,
  false,
  0,
  -0,
  -1,
  1e308,
  -1e308,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.NaN,
  2 ** 53 + 1,
  0.5,
  '',
  '12',
  '__proto__',
  'x'.repeat(5000),
  '\uD800',
  [],
  [null],
  {},
  { __proto__: { pollue: true } },
  JSON.parse('{"__proto__": {"pollue": true}}'),
]

/** Un nombre plausible, ou une chaîne étrange. */
function nombreEnTexte(t: Tirage, min: number, max: number): string {
  return t.si(0.6) ? String(min + t.hasard() * (max - min)) : t.parmi(TEXTES_ETRANGES)
}

/**
 * Une valeur plausible, ou étrange une fois sur dix : les formes imbriquées
 * (une coordonnée dans une ligne dans une géométrie dans une feature)
 * multiplient les tirages, et à une sur trois aucun cas n'allait au bout.
 */
function valeur(t: Tirage, plausible: () => unknown): unknown {
  return t.si(0.9) ? plausible() : t.parmi(VALEURS_ETRANGES)
}

/** Échappe pour XML, sauf quand le cas veut justement du XML cassé. */
function xml(t: Tirage, texte: string): string {
  return t.si(0.9) ? texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') : texte
}

/**
 * Lit sous `vm`, dont le délai interrompt **aussi** une boucle synchrone —
 * vérifié, contrairement au délai d'un test Vitest. Deux secondes pour un
 * seul cas de quelques centaines d'octets : seuil de la sonde, tranché au
 * jugé (§2), sans rapport avec un calcul de l'application.
 */
function sansBoucle<T>(ou: string, lire: () => T): T {
  try {
    return runInNewContext('lire()', { lire }, { timeout: 2000 }) as T
  } catch (erreur) {
    if ((erreur as { code?: string }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw new Boucle(ou)
    throw erreur
  }
}

/**
 * Une classe à part, que `erreurNommee` refuse toujours. Vu au §1 : son
 * message, « shapefile : boucle… », satisfaisait la règle d'erreur du
 * lecteur de shapefile, et la boucle de #664 remise en place passait pour
 * une erreur attendue.
 */
class Boucle extends Error {
  constructor(ou: string) {
    super(`${ou} : boucle — plus de 2 s sur un seul cas`)
    this.name = 'Boucle'
  }
}

function invariant(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function surLeGlobe(points: readonly unknown[], ou: string): void {
  points.forEach((p, i) => {
    invariant(isWgs84Coordinate(p), `${ou}[${String(i)}] hors du globe : ${JSON.stringify(p)}`)
  })
}

function finiOuNul(valeurs: readonly (number | null)[] | null | undefined, ou: string): void {
  valeurs?.forEach((v, i) => {
    invariant(v === null || Number.isFinite(v), `${ou}[${String(i)}] = ${String(v)}`)
  })
}

/** Une erreur est permise si c'est celle que le lecteur nomme. */
function erreurNommee(erreur: unknown, attendue: (e: unknown) => boolean, ou: string): void {
  if (erreur instanceof Boucle) throw erreur
  if (attendue(erreur)) return
  const e = erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur)
  throw new Error(`${ou} : exception non nommée — ${e}`)
}

// ---------------------------------------------------------------- GPX, TCX

function unGpx(t: Tirage): string {
  const points = Array.from({ length: t.entier(0, 6) }, () => {
    const attributs = [
      t.si(0.9) ? `lat="${xml(t, nombreEnTexte(t, -90, 90))}"` : '',
      t.si(0.9) ? `lon="${xml(t, nombreEnTexte(t, -180, 180))}"` : '',
    ].join(' ')
    const ele = t.si(0.7) ? `<ele>${xml(t, nombreEnTexte(t, -400, 4800))}</ele>` : ''
    const time = t.si(0.5) ? `<time>${xml(t, t.si(0.5) ? '2026-07-14T08:00:00Z' : t.parmi(TEXTES_ETRANGES))}</time>` : ''
    const hdop = t.si(0.3) ? `<hdop>${xml(t, nombreEnTexte(t, 0, 20))}</hdop>` : ''
    return `<trkpt ${attributs}>${ele}${time}${hdop}</trkpt>`
  })
  const nom = t.si(0.5) ? `<name>${xml(t, t.parmi(TEXTES_ETRANGES))}</name>` : ''
  const copyright = t.si(0.2)
    ? `<metadata><copyright author="${xml(t, t.parmi(TEXTES_ETRANGES))}"><license>${xml(t, t.parmi(TEXTES_ETRANGES))}</license></copyright></metadata>`
    : ''
  const racine = t.si(0.95) ? 'gpx' : t.parmi(['kml', 'GPX', 'x'])
  const corps = t.si(0.8)
    ? `<trk>${nom}<trkseg>${points.join('')}</trkseg></trk>`
    : `<rte>${points.join('').replace(/trkpt/g, 'rtept')}</rte>`
  return `<?xml version="1.0"?><${racine} version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${copyright}${corps}</${racine}>`
}

function verifierGpx(t: Tirage, lire: (texte: string) => ReturnType<typeof parseGpx>, ou: string): boolean {
  let lu
  try {
    const texte = unGpx(t)
    lu = sansBoucle(ou, () => lire(texte))
  } catch (erreur) {
    erreurNommee(erreur, (e) => e instanceof GpxError, ou)
    return false
  }
  surLeGlobe(lu.points, `${ou} points`)
  invariant(lu.elevations.length === lu.points.length, `${ou} : altitudes non alignées`)
  invariant(lu.times.length === lu.points.length, `${ou} : horodatages non alignés`)
  finiOuNul(lu.elevations, `${ou} altitude`)
  finiOuNul(lu.times, `${ou} horodatage`)
  finiOuNul(lu.hdops, `${ou} hdop`)
  invariant(Number.isInteger(lu.pointsHorsLimites) && lu.pointsHorsLimites >= 0, `${ou} : pointsHorsLimites`)
  const gain = elevationGainMeters(lu.elevations)
  invariant(gain === null || (Number.isFinite(gain) && gain >= 0), `${ou} : D+ ${String(gain)}`)
  return lu.points.length > 0
}

function unTcx(t: Tirage): string {
  const points = Array.from({ length: t.entier(0, 5) }, () => {
    const position = t.si(0.9)
      ? `<Position><LatitudeDegrees>${xml(t, nombreEnTexte(t, -90, 90))}</LatitudeDegrees><LongitudeDegrees>${xml(t, nombreEnTexte(t, -180, 180))}</LongitudeDegrees></Position>`
      : ''
    const altitude = t.si(0.7) ? `<AltitudeMeters>${xml(t, nombreEnTexte(t, -400, 4800))}</AltitudeMeters>` : ''
    const temps = t.si(0.6) ? `<Time>${xml(t, t.si(0.5) ? '2026-07-14T08:00:00Z' : t.parmi(TEXTES_ETRANGES))}</Time>` : ''
    return `<Trackpoint>${temps}${position}${altitude}</Trackpoint>`
  })
  return `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity><Lap><Track>${points.join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
}

// ---------------------------------------------------------------- FIT

/**
 * Un FIT qui a la forme d'un vrai : un en-tête, une définition du message
 * « record » (20), puis des enregistrements. Chaque champ peut mentir sur
 * son type de base ou sa taille — c'est par là qu'un `float64` NaN entrerait
 * dans une altitude —, et le reste du fichier est parfois du bruit.
 */
function unFit(t: Tirage): ArrayBuffer {
  const octets: number[] = []
  const u8 = (n: number) => octets.push(n & 0xff)
  const u16 = (n: number) => {
    u8(n)
    u8(n >> 8)
  }
  const u32 = (n: number) => {
    u16(n)
    u16(n >>> 16)
  }
  const nombre = (taille: number, valeur: number, type: number) => {
    const v = new DataView(new ArrayBuffer(8))
    if (type === 0x88) v.setFloat32(0, valeur, true)
    else if (type === 0x89) v.setFloat64(0, valeur, true)
    else v.setInt32(0, valeur, true)
    for (let i = 0; i < taille; i++) u8(i < 8 ? v.getUint8(i) : 0)
  }
  // Les champs : position, altitude, horodatage — leur type de base, et leur
  // taille, mentent une fois sur cinq.
  const champ = (numero: number, taille: number, type: number) =>
    t.si(0.8)
      ? { numero, taille, type }
      : { numero, taille: t.parmi([0, 1, 2, 4, 8, 255]), type: t.parmi([0x88, 0x89, 0x07, 0x8e, 0x1f, 0xff]) }
  const champs = [champ(0, 4, 0x85), champ(1, 4, 0x85), champ(2, 2, 0x84), champ(253, 4, 0x86)]
  const corps: number[] = []
  const avant = octets.length
  // Définition : en-tête 0x40, réservé, petit-boutiste, message 20.
  u8(0x40)
  u8(0)
  u8(t.si(0.9) ? 0 : 1)
  u16(t.si(0.9) ? 20 : t.entier(0, 0xffff))
  u8(champs.length)
  for (const c of champs) {
    u8(c.numero)
    u8(c.taille)
    u8(c.type)
  }
  for (let r = t.entier(0, 6); r > 0; r--) {
    u8(t.si(0.9) ? 0 : t.entier(0, 255))
    const lat = t.si(0.8) ? Math.round(((45 + t.hasard()) * 2 ** 31) / 180) : t.parmi([0x7fffffff, 0, -1, 2 ** 31 - 2])
    const lon = t.si(0.8) ? Math.round(((4.5 + t.hasard()) * 2 ** 31) / 180) : t.parmi([0x7fffffff, 0, -1])
    const valeurs = [lat, lon, t.si(0.8) ? 3000 : 0xffff, t.entier(0, 2 ** 31)]
    champs.forEach((c, i) => {
      const flottant = c.type === 0x88 || c.type === 0x89
      const v = flottant ? t.parmi([Number.NaN, Number.POSITIVE_INFINITY, 1e308, -1e308, 600]) : (valeurs[i] ?? 0)
      nombre(c.taille, v, c.type)
    })
  }
  if (t.si(0.2)) for (let i = t.entier(1, 40); i > 0; i--) u8(t.entier(0, 255))
  corps.push(...octets.splice(avant))
  const tailleDonnees = t.si(0.9) ? corps.length : t.parmi([0, corps.length + 1, 2 ** 31])
  // En-tête de 14 octets : taille, protocole, profil, taille des données, « .FIT », CRC.
  u8(14)
  u8(0x20)
  u16(2100)
  u32(tailleDonnees)
  octets.push(0x2e, 0x46, 0x49, 0x54)
  u16(0)
  octets.push(...corps)
  const tampon = new Uint8Array(octets)
  return t.si(0.1) ? tampon.slice(0, t.entier(0, tampon.length)).buffer : tampon.buffer
}

// ---------------------------------------------------------------- GeoJSON

function uneCoordonnee(t: Tirage): unknown {
  return valeur(t, () => [valeur(t, () => -180 + t.hasard() * 360), valeur(t, () => -90 + t.hasard() * 180)])
}

function unGeoJson(t: Tirage): unknown {
  const ligne = () => valeur(t, () => Array.from({ length: t.entier(0, 4) }, () => uneCoordonnee(t)))
  const geometrie = () =>
    valeur(t, () =>
      t.si(0.5)
        ? { type: valeur(t, () => 'LineString'), coordinates: ligne() }
        : { type: valeur(t, () => 'MultiLineString'), coordinates: valeur(t, () => [ligne(), ligne()]) },
    )
  const feature = () =>
    valeur(t, () => ({
      type: valeur(t, () => 'Feature'),
      properties: valeur(t, () => ({ name: valeur(t, () => 'Boucle'), source: valeur(t, () => 'Département') })),
      geometry: geometrie(),
    }))
  const racine = valeur(t, () => ({
    type: valeur(t, () => 'FeatureCollection'),
    features: valeur(t, () => Array.from({ length: t.entier(0, 4) }, feature)),
    source: valeur(t, () => ({ author: valeur(t, () => 'Département de l’Ain'), license: valeur(t, () => 'https://x') })),
  }))
  // Ce qui arrive vraiment passe par JSON.parse : 1e999 y devient l'infini.
  return t.si(0.5) ? racine : JSON.parse(JSON.stringify(racine))
}

// ---------------------------------------------------------------- sauvegarde

function uneSauvegarde(t: Tirage): string {
  const trace = () =>
    valeur(t, () => ({
      id: valeur(t, () => 'trace-1'),
      filename: valeur(t, () => 'sortie.gpx'),
      points: valeur(t, () => Array.from({ length: t.entier(0, 4) }, () => uneCoordonnee(t))),
    }))
  const perso = () =>
    valeur(t, () => ({
      osmRelationId: valeur(t, () => -t.entier(1, 50)),
      ways: valeur(t, () => [{ osmWayId: 1, coords: valeur(t, () => [uneCoordonnee(t), uneCoordonnee(t)]) }]),
    }))
  const objet = valeur(t, () => ({
    format: valeur(t, () => BACKUP_FORMAT),
    version: valeur(t, () => t.entier(1, BACKUP_VERSION + 1)),
    exportedAt: valeur(t, () => '2026-11-12T10:00:00Z'),
    tracks: valeur(t, () => Array.from({ length: t.entier(0, 3) }, trace)),
    customItineraries: valeur(t, () => Array.from({ length: t.entier(0, 2) }, perso)),
    parcoursDeclares: valeur(t, () => [{ itineraryId: valeur(t, () => 7), declareLe: valeur(t, () => '2026-11-12'), date: valeur(t, () => null) }]),
    settings: valeur(t, () => ({ toleranceMeters: valeur(t, () => 50), completionPct: valeur(t, () => 95) })),
  }))
  const texte = JSON.stringify(objet)
  // L'infini n'existe en JSON que sous la forme d'un nombre trop grand : on
  // le glisse à la place d'un réglage, d'un identifiant ou d'une coordonnée.
  if (t.si(0.25)) {
    const cible = t.parmi(['"toleranceMeters":50', '"completionPct":95', '"itineraryId":7', '[', ','])
    const remplace = cible.startsWith('"') ? `${cible.slice(0, cible.indexOf(':') + 1)}1e999` : `${cible}1e999,`
    return texte.replace(cible, remplace)
  }
  return t.si(0.05) ? texte.slice(0, t.entier(0, texte.length)) : texte
}

// ---------------------------------------------------------------- shapefile

/**
 * Un en-tête de shapefile valide le plus souvent, puis des enregistrements
 * dont chaque champ de longueur ou d'indice peut mentir : négatif, énorme,
 * ou en désaccord avec ses voisins.
 */
function unShapefile(t: Tirage): ArrayBuffer {
  const enregistrements: Uint8Array[] = []
  for (let r = t.entier(0, 3); r > 0; r--) {
    // Un enregistrement nul (type 0, 4 octets) : les vrais fichiers en ont.
    // Sa longueur à -4 mots ramène la lecture sur son propre en-tête — la
    // boucle sans fin de #664, qu'aucun tirage indépendant n'atteignait.
    if (t.si(0.1)) {
      const nul = new DataView(new ArrayBuffer(12))
      nul.setInt32(0, r, false)
      nul.setInt32(4, t.si(0.5) ? 2 : -4, false)
      nul.setInt32(8, 0, true)
      enregistrements.push(new Uint8Array(nul.buffer))
      continue
    }
    const nbParties = t.si(0.95) ? t.entier(1, 3) : t.parmi([0, -1, 2 ** 30, -(2 ** 31)])
    const nbPoints = t.si(0.95) ? t.entier(0, 6) : t.parmi([-1, 2 ** 30, -(2 ** 31)])
    const parties = Math.max(0, Math.min(nbParties, 3))
    const points = Math.max(0, Math.min(nbPoints, 6))
    const contenu = new DataView(new ArrayBuffer(44 + 4 * parties + 16 * points))
    contenu.setInt32(0, t.si(0.9) ? 3 : t.parmi([0, 0, 1, 5, -3]), true)
    contenu.setInt32(36, nbParties, true)
    contenu.setInt32(40, nbPoints, true)
    for (let p = 0; p < parties; p++) {
      const debut = t.si(0.9) ? Math.min(p * 2, points) : t.parmi([-1, -(2 ** 31), 2 ** 30, points + 1, 0])
      contenu.setInt32(44 + 4 * p, debut, true)
    }
    for (let i = 0; i < points; i++) {
      const q = 44 + 4 * parties + 16 * i
      contenu.setFloat64(q, t.si(0.8) ? 800_000 + t.hasard() * 1000 : t.parmi([Number.NaN, 1e308, Number.POSITIVE_INFINITY]), true)
      contenu.setFloat64(q + 8, t.si(0.8) ? 6_500_000 + t.hasard() * 1000 : -1e308, true)
    }
    const entete = new DataView(new ArrayBuffer(8))
    entete.setInt32(0, r, false)
    const mots = contenu.byteLength / 2
    // -4 mots, soit -8 octets : la lecture revient pile sur l'en-tête qu'elle
    // vient de lire — la boucle sans fin trouvée par la relecture de #664.
    entete.setInt32(4, t.si(0.9) ? mots : t.parmi([-4, -4, -1, -(2 ** 31), 0, 1, mots + 1, 2 ** 30]), false)
    enregistrements.push(new Uint8Array(entete.buffer), new Uint8Array(contenu.buffer))
  }
  const corps = enregistrements.reduce((n, e) => n + e.length, 0)
  const tout = new Uint8Array(100 + corps)
  const v = new DataView(tout.buffer)
  v.setInt32(0, t.si(0.95) ? 9994 : 9993, false)
  v.setInt32(24, (100 + corps) / 2, false)
  v.setInt32(32, t.si(0.9) ? 3 : 5, true)
  let o = 100
  for (const e of enregistrements) {
    tout.set(e, o)
    o += e.length
  }
  // Tronqué de temps en temps, comme un téléchargement interrompu.
  return t.si(0.15) ? tout.slice(0, t.entier(0, tout.length)).buffer : tout.buffer
}

// ---------------------------------------------------------------- les lecteurs

/**
 * Chaque lecteur rend `true` quand le cas a **produit** quelque chose —
 * des points, des traces, des lignes. Un fuzz dont aucun cas ne franchit
 * la première garde ne prouve rien : la première version de ce fichier
 * écrivait `format: 'sentiers-backup'` au lieu de `BACKUP_FORMAT`, et tous
 * ses cas de sauvegarde s'arrêtaient au premier `if`.
 */
const LECTEURS: Record<string, (t: Tirage) => boolean | Promise<boolean>> = {
  gpx(t) {
    return verifierGpx(t, (texte) => parseGpx(texte, new DOMParser()), 'gpx')
  },
  tcx(t) {
    let lu
    try {
      const texte = unTcx(t)
      lu = sansBoucle('tcx', () => parseTcx(texte, new DOMParser()))
    } catch (erreur) {
      erreurNommee(erreur, (e) => e instanceof TcxError || e instanceof GpxError, 'tcx')
      return false
    }
    surLeGlobe(lu.points, 'tcx points')
    finiOuNul(lu.elevations, 'tcx altitude')
    finiOuNul(lu.times, 'tcx horodatage')
    return lu.points.length > 0
  },
  fit(t) {
    let lu
    try {
      const tampon = unFit(t)
      lu = sansBoucle('fit', () => parseFit(tampon))
    } catch (erreur) {
      erreurNommee(erreur, (e) => e instanceof FitError, 'fit')
      return false
    }
    surLeGlobe(lu.points, 'fit points')
    finiOuNul(lu.elevations, 'fit altitude')
    finiOuNul(lu.times, 'fit horodatage')
    return lu.points.length > 0
  },
  geojson(t) {
    const donnees = unGeoJson(t)
    let traces
    try {
      traces = sansBoucle('geojson', () => parseGeoJsonTrails(donnees))
    } catch (erreur) {
      erreurNommee(erreur, (e) => e instanceof GeoJsonError, 'geojson')
      return false
    }
    for (const trace of traces) {
      invariant(trace.name === null || typeof trace.name === 'string', 'geojson : nom')
      for (const ligne of trace.lines) surLeGlobe(ligne, 'geojson ligne')
    }
    const source = sourceDeclaree(donnees)
    invariant(
      source === null || (typeof source.author === 'string' && typeof source.license === 'string'),
      `geojson : source ${JSON.stringify(source)}`,
    )
    return traces.length > 0
  },
  async sauvegarde(t) {
    let lu
    try {
      lu = await lireArchiveBackup(uneSauvegarde(t))
    } catch (erreur) {
      erreurNommee(erreur, (e) => e instanceof BackupError, 'sauvegarde')
      return false
    }
    for (const trace of lu.tracks) surLeGlobe(trace.points, 'sauvegarde trace')
    for (const perso of lu.customItineraries) {
      for (const way of perso.ways) surLeGlobe(way.coords, 'sauvegarde perso')
    }
    for (const [cle, v] of Object.entries(lu.settings)) {
      invariant(Number.isFinite(v), `sauvegarde : réglage ${cle} = ${String(v)}`)
    }
    invariant(!('pollue' in {}), 'sauvegarde : prototype pollué')
    return lu.tracks.length > 0 || lu.customItineraries.length > 0
  },
  reglages(t) {
    // Ce que la base rend au démarrage : un nombre, une chaîne, ou rien.
    const brut = valeur(t, () => (t.si(0.5) ? t.entier(-50, 500) : JSON.stringify([t.entier(-9, 9), valeur(t, () => 3)])))
    const brutStocke = typeof brut === 'number' || typeof brut === 'string' ? brut : undefined
    const tolerance = lireTolerance(brut)
    invariant(
      tolerance >= TOLERANCE_MIN && tolerance <= TOLERANCE_MAX,
      `réglages : tolérance ${String(tolerance)} pour ${String(brut)}`,
    )
    const pct = normalizeCompletionPct(brut)
    invariant(COMPLETION_CHOICES.includes(pct), `réglages : seuil ${String(pct)}`)
    for (const id of lireObjectifs(brutStocke)) {
      invariant(Number.isSafeInteger(id), `réglages : objectif ${String(id)} pour ${String(brut)}`)
    }
    invariant(typeof lireDrapeau(brut) === 'boolean', 'réglages : drapeau')
    return true
  },
  shapefile(t) {
    const octets = unShapefile(t)
    let lignes
    try {
      lignes = sansBoucle('shapefile', () => lignesDuShapefile(octets))
    } catch (erreur) {
      // Le lecteur lève des `Error` simples, en français : un `RangeError`
      // de `DataView` dirait qu'une lecture est allée hors du fichier.
      erreurNommee(
        erreur,
        (e) => e instanceof Error && e.name === 'Error' && /shapefile/.test(e.message),
        'shapefile',
      )
      return false
    }
    const points = lignes.reduce((n, l) => n + l.length, 0)
    invariant(points * 16 <= octets.byteLength, `shapefile : ${String(points)} points pour ${String(octets.byteLength)} octets`)
    return points > 0
  },
}

/** Rejoue un seul cas, à l'identique. */
async function rejouer(lecteur: string, cas: number): Promise<boolean> {
  const lire = LECTEURS[lecteur]
  if (!lire) throw new Error(`lecteur inconnu : ${lecteur}`)
  try {
    return await lire(new Tirage(cas))
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur)
    throw new Error(`[graine ${String(GRAINE)}, cas ${String(cas)} — rejouer('${lecteur}', ${String(cas)})] ${message}`, {
      cause: erreur,
    })
  }
}

describe('fuzz à graine fixe des lecteurs d’import (#670)', () => {
  for (const lecteur of Object.keys(LECTEURS)) {
    it(`${lecteur} : ${String(CAS)} cas, aucune exception non nommée, rien hors bornes`, async () => {
      let produits = 0
      for (let cas = 0; cas < CAS; cas++) if (await rejouer(lecteur, cas)) produits += 1
      // Seuil de la sonde, tranché au jugé (§2) : il ne garde aucun calcul
      // de l'application, seulement que le fuzz franchisse la porte.
      expect(produits, `${lecteur} : cas allés au bout`).toBeGreaterThanOrEqual(CAS / 10)
    })
  }

  it('un cas se rejoue à l’identique', () => {
    const a = new Tirage(42)
    const b = new Tirage(42)
    expect(Array.from({ length: 5 }, () => a.hasard())).toEqual(Array.from({ length: 5 }, () => b.hasard()))
  })
})
