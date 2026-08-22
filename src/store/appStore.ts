import { create } from 'zustand'
import {
  buildRefQuery,
  buildAroundQuery,
  RAYON_AUTOUR_METERS,
  buildZoneQuery,
  fetchOverpass,
  parseOverpassResponse,
  OverpassError,
  ZONES,
  libelleDeZone,
} from '../core/overpass.ts'
import {
  parseGpx,
  GpxError,
  elevationGainMeters,
  trackFingerprint,
  type ParsedGpx,
} from '../core/gpx.ts'
import {
  backupFilename,
  buildBackup,
  compresserBackup,
  resumeFusion,
  fusionnerItineraires,
  fusionnerTraces,
  lireArchiveBackup,
  serialiserBackup,
  BackupError,
} from '../core/backup.ts'
import { downloadBlob } from '../lib/download.ts'
import {
  GeocodeError,
  chercherLieux,
  type Lieu,
} from '../core/geocode.ts'
import { resumeObjectif, type ResumeObjectif } from '../core/objectifs.ts'
import { polylineLengthMeters } from '../core/sampling.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import { parseBouclesGeoJSON } from '../core/boucles.ts'
import {
  buildRoutingGraph,
  clefsAllerRetour,
  clefsBouclees,
  routeThrough,
  snapToNetwork,
  type RoutingGraph,
} from '../core/routing.ts'
import {
  elevationStats,
  fetchElevationProfile,
  ElevationError,
  type ProfilePoint,
} from '../core/elevation.ts'
import { fetchPois } from '../core/poi.ts'
import { outingHighlights, type OutingHighlight } from '../core/outing.ts'
import { FitError, looksLikeFit, parseFit } from '../core/fit.ts'
import {
  messagePointsHorsLimites,
  messageTropEspacee,
} from '../core/coordonnees.ts'
import { construireDemonstration } from '../core/demonstration.ts'
import {
  estModeAffichage,
  lireDrapeau,
  type ModeAffichage,
} from '../core/affichage.ts'
import {
  apiDuNavigateur,
  demanderPersistance,
  etatDuStockage,
  type EtatDuStockage,
} from '../core/stockage.ts'
import { TcxError, looksLikeTcx, parseTcx } from '../core/tcx.ts'
import {
  GeoJsonError,
  looksLikeGeoJson,
  parseGeoJsonTrails,
  type GeoJsonTrail,
} from '../core/geojson.ts'
import {
  ZipError,
  entreesDeTrace,
  listZipEntries,
  looksLikeZip,
  readZipEntry,
} from '../core/zip.ts'
import {
  crossedMilestones,
  DEFAULT_COMPLETION_PCT,
  franchissementTientEncore,
  normalizeCompletionPct,
} from '../core/milestones.ts'
import { espacementTropGrand } from '../core/matching.ts'
import { noterSortie, type EntreeJournal } from '../core/journalSortant.ts'
import type { MatchResult } from '../core/matching.ts'
import {
  GEO_OPTIONS,
  geolocationErrorMessage,
} from '../core/geolocation.ts'
import type {
  ElevationProfile,
  Itinerary,
  LonLat,
  PointOfInterest,
  Track,
  UserPosition,
} from '../core/types.ts'
import { DEFAULT_TOLERANCE_METERS, STEP_METERS } from '../core/types.ts'
import {
  openSentiersDb,
  zoneUtilisable,
  SCHEMA_ZONE,
  DbError,
  type SentiersDb,
  type SettingKey,
} from '../db/database.ts'
import { computeMatching } from './matchingClient.ts'

/**
 * Les réglages que la personne a changés depuis l'ouverture de l'application.
 *
 * `init()` relit IndexedDB, ce qui prend quelques centaines de millisecondes,
 * et applique ensuite ce qu'il y a trouvé. Entre les deux, un clic est
 * possible — et il était écrasé sans un mot. Mesuré : sous la charge de la
 * suite e2e complète, fermer le guide de démarrage dans la première seconde
 * le rouvrait tout seul.
 *
 * Le même piège avait déjà été fermé pour les traces, trois lignes plus bas
 * dans `init` : « fusion, jamais remplacement ». Il restait ouvert pour les
 * réglages, et je l'ai rouvert d'un cran de plus en y ajoutant deux drapeaux
 * sans relire ce commentaire (revue du sprint 6).
 *
 * Un ensemble nommé, consulté par `init`, plutôt qu'une condition recopiée
 * sur chacun des sept réglages (CLAUDE.md §4).
 */
const reglagesTouches = new Set<SettingKey>()

/** À appeler dans chaque setter, avant d'écrire. */
function marquerTouche(clef: SettingKey): void {
  reglagesTouches.add(clef)
}

/**
 * Ce qu'il faut retenir au démarrage : la base, sauf si la personne a déjà
 * tranché entre-temps.
 */
function repriseAuDemarrage<T>(clef: SettingKey, deLaBase: T, enMemoire: T): T {
  return reglagesTouches.has(clef) ? enMemoire : deLaBase
}

/** Pour les tests : repartir d'une session vierge. */
export function oublierReglagesTouches(): void {
  reglagesTouches.clear()
}

/**
 * Réunit ce qui vient de la base et ce qui est déjà en mémoire, sans doublon.
 * Les entrées mémoire absentes de la base — importées pendant que celle-ci se
 * lisait — sont conservées à la suite.
 */
function fusionner<T extends { id: string } | { osmRelationId: number }>(
  base: T[],
  memoire: T[],
): T[] {
  const cle = (element: T): string =>
    'id' in element ? element.id : String(element.osmRelationId)
  const connus = new Set(base.map(cle))
  return [...base, ...memoire.filter((element) => !connus.has(cle(element)))]
}

export const MIN_TOLERANCE = 25
export const MAX_TOLERANCE = 100

/** Étape affichée pendant zoneLoading, pour un retour visuel non figé. */
export type ZoneLoadStage = 'requesting' | 'retrying' | 'processing' | null

/**
 * Une trace mise de côté parce qu'elle ressemble à une autre déjà importée.
 *
 * On garde la trace toute prête plutôt que le fichier : « importer quand
 * même » n'a alors plus rien à relire, ni à risquer d'échouer une seconde
 * fois.
 */
export interface DoublonEnAttente {
  id: string
  filename: string
  /** Nom du fichier dont l'empreinte coïncide. */
  ressembleA: string
  track: Track
}

export interface AppState {
  // Persistance
  db: SentiersDb | null
  dbWarning: string | null

  /**
   * Ce qui est sorti de l'appareil depuis l'ouverture (issue #178).
   * En mémoire seulement : un compteur de vie privée qu'on persisterait
   * serait une ironie coûteuse.
   */
  sortiesReseau: EntreeJournal[]
  noterSortieReseau: (url: string) => void

  // Zone chargée
  zoneKey: string | null
  zoneLabel: string | null
  itineraries: Itinerary[]
  zoneFetchedAt: string | null
  zoneLoading: boolean
  /** Étape en cours pendant zoneLoading, pour un retour visuel non figé. */
  zoneLoadStage: ZoneLoadStage
  /** Octets reçus du serveur Overpass pendant l'étape de téléchargement. */
  zoneLoadBytes: number
  /** Compte rendu du dernier import de sauvegarde, à afficher puis effacer. */
  backupMessage: string | null

  // Recherche par nom de lieu (le premier écran ne demande plus une ref)
  lieux: Lieu[]
  lieuxLoading: boolean
  lieuError: string | null
  /** Vrai quand la dernière recherche n'a rien trouvé — différent de « pas encore cherché ». */
  lieuxVides: boolean

  /**
   * Itinéraires épinglés comme objectifs (issue #13). Le tableau de bord
   * constate ; un objectif dit par où continuer.
   */
  objectifs: number[]
  zoneError: string | null

  // Traces GPX
  tracks: Track[]
  importErrors: string[]
  /**
   * Traces écartées comme doublons, gardées le temps que la personne
   * tranche. L'empreinte est une heuristique : elle n'a pas le droit de
   * refuser sans recours (issue #165).
   */
  importDoublons: DoublonEnAttente[]
  /**
   * Une démonstration est en cours (issue #172).
   *
   * Elle ne touche jamais la base : ses itinéraires et ses sorties vivent en
   * mémoire, le temps de montrer à quoi ressemble un tableau de bord rempli.
   * Un rechargement n'en laisse rien, et une sauvegarde ne peut pas
   * l'emporter par mégarde.
   */
  demonstration: boolean
  /**
   * État du stockage : mode persistant obtenu, espace utilisé (issue #169).
   * Null tant que rien n'a été mesuré.
   */
  stockage: EtatDuStockage | null
  /**
   * Registre d'affichage (issue #173). Deux modes, mêmes données, même
   * calcul : le mode simple cache, il n'enlève pas.
   */
  modeAffichage: ModeAffichage
  /** Tout agrandi et contrasté, y compris les libellés portés par la carte. */
  grosTexte: boolean
  /**
   * Le guide de premier lancement a-t-il été fermé ?
   *
   * Persisté, parce que la plainte porte précisément sur « quand on ouvre
   * l'appli » : un guide qui revient à chaque rechargement n'a pas été fermé,
   * il a été repoussé. Ce qui le rouvre est le rappel de `rappelGuideVisible`.
   */
  guideFerme: boolean
  /**
   * Le panneau latéral a-t-il été replié ?
   *
   * Sur téléphone la feuille avait déjà trois positions ; au-dessus de
   * 800 px la colonne était définitive et prenait 390 px de carte sans
   * qu'aucun geste puisse la rendre. Persisté pour la même raison que
   * ci-dessus.
   */
  panneauReplie: boolean

  // Itinéraires créés par l'utilisateur (réseau PERSO, ids négatifs)
  customItineraries: Itinerary[]

  // Matching
  toleranceMeters: number
  /** Seuil « bouclé », choisi par l'utilisateur (voir core/milestones). */
  completionPct: number
  matching: MatchResult | null
  /** Résultats des itinéraires persos, hors stats globales OSM. */
  customMatching: MatchResult | null
  matchingBusy: boolean

  // UI
  selectedItineraryId: number | null
  /** Avancement d'un import multi-fichiers, pour que l'attente ait un sujet. */
  importProgress: { done: number; total: number; filename: string } | null
  /**
   * Vrai quand la zone affichée vient du cache au démarrage, et non d'un clic
   * de l'utilisateur pendant cette session. C'est ce qui distingue « je
   * reviens voir ma progression » de « je suis en train de choisir ».
   */
  zoneRestoredAtStartup: boolean
  /** Jalon franchi lors du dernier recalcul, à annoncer une fois. */
  celebration: { itineraryId: number; milestone: number } | null
  /** Ce qu'une sortie a apporté, calculé à la demande (trace dépliée). */
  outingDetail: {
    trackId: string
    highlights: OutingHighlight[]
    loading: boolean
  } | null

  // Fiche détail (profil altimétrique + points d'intérêt + vue 3D)
  detailItineraryId: number | null
  elevationProfile: ElevationProfile | null
  elevationError: string | null
  elevationLoading: boolean
  /** Point survolé sur le profil altimétrique, à marquer sur la carte. */
  elevationHover: ProfilePoint | null
  pois: PointOfInterest[]
  poisLoading: boolean
  view3D: boolean
  /** Coordonnée à centrer sur la carte (POI cliqué) ; consommée une fois par MapView. */
  focusTarget: LonLat | null
  /** Cadre à cadrer sur la carte (étape d'un long itinéraire) ; consommé une fois. */
  focusBounds: [LonLat, LonLat] | null

  // Tracé d'itinéraire accroché aux sentiers affichés
  drawMode: boolean
  /** Clés de nœuds du graphe pour chaque étape posée. */
  drawWaypointKeys: string[]
  /** Coordonnées des étapes, pour les afficher sur la carte. */
  drawWaypoints: LonLat[]
  /** Tracé calculé qui suit les chemins entre les étapes. */
  drawPath: LonLat[]
  drawError: string | null
  /** D+ estimé du tracé en cours, null tant qu'on ne l'a pas demandé. */
  drawGainMeters: number | null
  drawGainLoading: boolean

  // Position de l'utilisateur (API du navigateur, jamais transmise)
  userPosition: UserPosition | null
  geoWatching: boolean
  geoError: string | null

  init: () => Promise<void>
  loadZone: (zoneId: string, options?: { force?: boolean }) => Promise<void>
  loadRef: (ref: string, options?: { force?: boolean }) => Promise<void>
  /**
   * Recharge la zone affichée depuis le réseau, quelle que soit sa nature.
   * Savoir de quelle sorte de zone il s'agit appartient au magasin : le
   * bouton « Actualiser » ne peut pas deviner, et se trompait en silence.
   */
  rafraichirZone: () => Promise<void>
  /** Interrompt le chargement de zone en cours (l'appel réseau peut continuer
   *  en arrière-plan, mais son résultat n'est plus appliqué à l'UI). */
  cancelZoneLoad: () => void
  importGpxFiles: (files: Iterable<File>) => Promise<void>
  importCustomGpx: (files: Iterable<File>) => Promise<void>
  removeTrack: (id: string) => Promise<void>
  removeCustomItinerary: (id: number) => Promise<void>
  /** Écrit une sauvegarde complète (traces, itinéraires perso, réglages). */
  exporterSauvegarde: () => Promise<void>
  /** Relit une sauvegarde et la fusionne avec ce qui est déjà là. */
  importerSauvegarde: (file: File) => Promise<void>
  /** Efface le compte rendu du dernier import de sauvegarde. */
  clearBackupMessage: () => void
  /** Cherche des communes par nom (API Adresse de la BAN). */
  chercherLieu: (query: string) => Promise<void>
  /** Charge les itinéraires dans un rayon autour d'un lieu trouvé. */
  loadAutour: (lieu: Lieu, options?: { force?: boolean }) => Promise<void>
  /** Referme la liste des propositions. */
  effacerLieux: () => void
  /** Épingle (ou dépingle) un itinéraire comme objectif. */
  basculerObjectif: (id: number) => Promise<void>
  /** Ce qu'il reste sur un objectif : mètres, pourcentage, tronçons. */
  resumeDeLObjectif: (id: number) => ResumeObjectif | null
  setTolerance: (value: number) => Promise<void>
  setCompletionPct: (value: number) => Promise<void>
  selectItinerary: (id: number | null) => void
  setElevationHover: (point: ProfilePoint | null) => void
  toggleOutingDetail: (trackId: string) => Promise<void>
  dismissCelebration: () => void
  clearImportErrors: () => void
  /** Passe outre le dédoublonnage et ajoute la trace pour de bon. */
  importerDoublon: (id: string) => Promise<void>
  /** Retire la proposition sans rien importer. */
  ignorerDoublon: (id: string) => void
  /** Retire toutes les propositions d'un coup (réimport d'une archive entière). */
  ignorerTousDoublons: () => void
  /** Montre un tableau de bord rempli, sans rien demander à l'utilisateur. */
  demarrerDemonstration: () => Promise<void>
  /** Efface la démonstration et rend l'application à son état réel. */
  quitterDemonstration: () => Promise<void>
  /**
   * Arrête la démonstration sans détruire ce qui est réel.
   *
   * Les itinéraires affichés pendant une démonstration ne sont pas fictifs :
   * ce sont les boucles open data de la Métropole. Seules les sorties le
   * sont. Les effacer en même temps que le drapeau détruisait des données
   * réelles — et l'utilisateur qui suivait le bandeau (« importez vos
   * propres traces ») se retrouvait devant un écran muet.
   */
  arreterDemonstration: () => Promise<void>
  /** Mesure l'espace occupé et le mode de stockage obtenu. */
  rafraichirStockage: () => Promise<void>
  setModeAffichage: (mode: ModeAffichage) => Promise<void>
  setGrosTexte: (actif: boolean) => Promise<void>
  setGuideFerme: (ferme: boolean) => Promise<void>
  setPanneauReplie: (replie: boolean) => Promise<void>
  openItineraryDetail: (id: number) => void
  closeItineraryDetail: () => void
  toggleView3D: () => void
  focusOn: (coords: LonLat) => void
  clearFocusTarget: () => void
  focusOnBounds: (bounds: [LonLat, LonLat]) => void
  clearFocusBounds: () => void
  toggleDrawMode: () => void
  addDrawPoint: (point: LonLat) => void
  undoDrawPoint: () => void
  /** Complète le tracé par le retour, en suivant le même chemin. */
  allerRetourTrace: () => void
  /** Referme le tracé sur son point de départ, par les chemins. */
  bouclerTrace: () => void
  /** Estime le dénivelé du tracé en cours (une seule requête, à la demande). */
  estimerDeniveleTrace: () => Promise<void>
  saveDrawnItinerary: (name: string) => Promise<void>
  toggleGeolocation: () => void
}

let recomputeSequence = 0
let outingSequence = 0
/**
 * Pourcentages du calcul précédent, pour repérer un jalon franchi. Remis à
 * null au changement de zone : on n'annonce pas comme un exploit ce qu'on
 * vient simplement de charger.
 */
let pctsPrecedents: Map<number, number> | null = null
let detailSequence = 0
/**
 * Relit la liste des objectifs épinglés. Elle est stockée en JSON parce que
 * le magasin de réglages ne connaît que des nombres et des chaînes ; un
 * contenu abîmé ne doit pas empêcher l'application de démarrer.
 */
function lireObjectifs(brut: number | string | undefined): number[] {
  if (typeof brut !== 'string') return []
  try {
    const lu: unknown = JSON.parse(brut)
    return Array.isArray(lu) ? lu.filter((id) => typeof id === 'number') : []
  } catch {
    return []
  }
}

let zoneLoadSequence = 0
/** Même garde pour la recherche de lieu : une frappe abandonnée ne gagne pas. */
let lieuSequence = 0
/**
 * Ouverture d'IndexedDB en cours, s'il y en a une. Sert à faire patienter les
 * écritures lancées pendant le démarrage plutôt qu'à les perdre (baseOuverte).
 */
let ouvertureBase: Promise<SentiersDb> | null = null
/**
 * Rend la main au navigateur le temps d'un rendu. Sans cela, l'avancement
 * d'un import est bien mis à jour dans l'état… et jamais peint, le fil
 * principal enchaînant directement sur le parsing suivant.
 */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Lit un fichier de trace, GPX ou FIT. Le format est reconnu à la signature
 * du contenu, pas à l'extension : une montre qui nomme mal son export reste
 * lisible, et un fichier renommé en .fit ne trompe personne.
 */
async function parseTraceFile(file: File): Promise<ParsedGpx> {
  const buffer = await file.arrayBuffer()
  if (looksLikeFit(buffer)) {
    const fit = parseFit(buffer)
    return {
      points: fit.points,
      elevations: fit.elevations,
      date: fit.date,
      pointsHorsLimites: fit.pointsHorsLimites,
      times: fit.times,
      hdops: fit.hdops,
      precisionsMetres: fit.precisionsMetres,
    }
  }
  // Le format est reconnu au contenu, pas à l'extension : un fichier renommé
  // reste lisible, et un fichier mal nommé ne fait pas échouer l'import.
  const texte = new TextDecoder().decode(buffer)
  if (looksLikeTcx(texte)) return parseTcx(texte, new DOMParser())
  return parseGpx(texte, new DOMParser())
}

/**
 * Nom de fichier lisible pour une entrée d'archive : sans son dossier, et
 * sans le `.gz` d'un `.gpx.gz` puisque le contenu, lui, est décompressé.
 */
function nomDEntree(chemin: string): string {
  const feuille = chemin.slice(chemin.lastIndexOf('/') + 1)
  return feuille.toLowerCase().endsWith('.gz') ? feuille.slice(0, -3) : feuille
}

/**
 * Remplace chaque archive déposée par les traces qu'elle contient.
 *
 * C'est ce qui tient lieu de connecteur Strava ou Garmin : l'utilisateur
 * exporte ses données chez eux et dépose l'archive ici (issue #89). Ce qui
 * n'est pas une trace — CSV de profil, photos, métadonnées macOS — est
 * ignoré sans être compté comme une erreur : ce sont des fichiers qui ne
 * nous concernent pas, pas des fichiers ratés.
 */
async function developperArchives(
  fichiers: File[],
  avancement: (nom: string, faits: number, total: number) => void,
): Promise<{ fichiers: File[]; erreurs: string[] }> {
  const sortie: File[] = []
  const erreurs: string[] = []
  for (const fichier of fichiers) {
    let buffer: ArrayBuffer
    try {
      buffer = await fichier.arrayBuffer()
    } catch {
      erreurs.push(`${fichier.name} : lecture impossible.`)
      continue
    }
    if (!looksLikeZip(buffer)) {
      sortie.push(fichier)
      continue
    }
    try {
      const traces = entreesDeTrace(listZipEntries(buffer))
      if (traces.length === 0) {
        erreurs.push(
          `${fichier.name} : aucune trace GPX, FIT ou TCX dans cette archive.`,
        )
        continue
      }
      for (const [index, entree] of traces.entries()) {
        avancement(nomDEntree(entree.name), index, traces.length)
        await pause()
        try {
          const contenu = await readZipEntry(buffer, entree)
          sortie.push(
            new File([contenu as BlobPart], nomDEntree(entree.name)),
          )
        } catch (error) {
          erreurs.push(
            error instanceof ZipError
              ? `${nomDEntree(entree.name)} : ${error.message}`
              : `${nomDEntree(entree.name)} : extraction impossible.`,
          )
        }
      }
    } catch (error) {
      erreurs.push(
        error instanceof ZipError
          ? `${fichier.name} : ${error.message}`
          : `${fichier.name} : archive illisible.`,
      )
    }
  }
  return { fichiers: sortie, erreurs }
}

/**
 * Lit un fichier d'itinéraires déposé dans « Mes itinéraires ».
 *
 * Un GeoJSON de sentiers — un PDIPR départemental, par exemple — décrit
 * plusieurs itinéraires d'un coup, là où un GPX n'en porte qu'un. Le format
 * est reconnu au contenu, pas à l'extension.
 */
async function lireItineraires(
  file: File,
): Promise<{ trails: GeoJsonTrail[]; pointsHorsLimites: number }> {
  const buffer = await file.arrayBuffer()
  if (!looksLikeFit(buffer)) {
    const texte = new TextDecoder().decode(buffer)
    if (looksLikeGeoJson(texte)) {
      let donnees: unknown
      try {
        donnees = JSON.parse(texte)
      } catch {
        throw new GeoJsonError('Ce fichier n’est pas un JSON valide.')
      }
      return { trails: parseGeoJsonTrails(donnees), pointsHorsLimites: 0 }
    }
  }
  const trace = await parseTraceFile(file)
  return {
    trails: [{ name: null, lines: [trace.points] }],
    pointsHorsLimites: trace.pointsHorsLimites,
  }
}

/**
 * La persistance n'est demandée qu'une fois par session, et seulement
 * lorsqu'il y a quelque chose à protéger (issue #169).
 *
 * La demander à l'ouverture n'aurait aucun sens pour un visiteur qui n'a
 * rien déposé : elle serait refusée ou ignorée, et l'occasion perdue — le
 * critère d'octroi tient à l'engagement avec le site.
 */
let persistanceDemandee = false
async function protegerLeStockage(): Promise<void> {
  if (persistanceDemandee) return
  persistanceDemandee = true
  await demanderPersistance(apiDuNavigateur())
}

/**
 * Quitte la démonstration avant toute opération qui touche aux données
 * réelles — import, export, restauration.
 *
 * Nommé plutôt que recopié : le premier passage avait couvert l'import et
 * l'export mais oublié la restauration, et une garde qu'on récrit à la main
 * à chaque appel finit toujours par manquer quelque part.
 */
async function sortirDeLaDemonstration(
  get: () => Pick<AppState, 'demonstration' | 'arreterDemonstration'>,
): Promise<void> {
  if (get().demonstration) await get().arreterDemonstration()
}

/** Identifiant du suivi de position en cours (API navigateur). */
let geoWatchId: number | null = null

/** Zones dont le périmètre couvre la Métropole de Lyon (boucles locales). */
const ZONES_WITH_LOCAL_BOUCLES = new Set(['rhone', 'trois'])

// Boucles locales open data, embarquées avec le site (© Métropole de Lyon,
// Licence Ouverte 2.0). Chargées paresseusement et une seule fois ; en cas
// d'échec, l'app fonctionne exactement comme avant — c'est un bonus.
let bouclesPromise: Promise<Itinerary[]> | null = null
function fetchLocalBoucles(): Promise<Itinerary[]> {
  bouclesPromise ??= fetch(
    `${import.meta.env.BASE_URL}data/boucles-metropole-lyon.json`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => parseBouclesGeoJSON(data, new Date().toISOString()))
    .catch(() => [])
    .then((boucles) => {
      // Un échec ne se mémorise pas. Hors ligne au premier chargement, les
      // boucles seraient sinon absentes pour toute la session, alors qu'un
      // simple changement de zone suffirait à les retrouver.
      if (boucles.length === 0) bouclesPromise = null
      return boucles
    })
  return bouclesPromise
}

export const useAppStore = create<AppState>()((set, get) => {
  // Graphe de routage mémoïsé sur l'identité des tableaux d'itinéraires :
  // le reconstruire à chaque clic de tracé serait inutilement coûteux sur
  // une grosse zone (des dizaines de milliers de sommets).
  let routingCache: {
    itineraries: Itinerary[]
    customItineraries: Itinerary[]
    graph: RoutingGraph
  } | null = null

  function routingGraph(): RoutingGraph {
    const { itineraries, customItineraries } = get()
    if (
      routingCache &&
      routingCache.itineraries === itineraries &&
      routingCache.customItineraries === customItineraries
    ) {
      return routingCache.graph
    }
    const graph = buildRoutingGraph([...itineraries, ...customItineraries])
    routingCache = { itineraries, customItineraries, graph }
    return graph
  }

  /**
   * Applique une nouvelle suite d'étapes au tracé en cours (aller-retour,
   * boucle). Si le routage échoue, on ne garde rien de la tentative : un
   * tracé à moitié modifié serait pire que pas de bouton du tout.
   */
  function appliquerClefs(keys: string[], quoi: 'aller-retour' | 'boucle') {
    const actuelles = get().drawWaypointKeys
    if (keys === actuelles || keys.length === actuelles.length) return
    const graph = routingGraph()
    const path = routeThrough(graph, keys)
    if (!path) {
      set({
        drawError:
          quoi === 'boucle'
            ? 'Aucun chemin ne ramène au point de départ dans les tracés affichés.'
            : 'Impossible de refaire le trajet en sens inverse dans les tracés affichés.',
      })
      return
    }
    set({
      drawWaypointKeys: keys,
      drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
      drawPath: path,
      drawError: null,
      drawGainMeters: null,
    })
  }

  /** Prochain identifiant libre pour un itinéraire perso (ids négatifs). */
  function nextCustomId(): number {
    return (
      Math.min(0, ...get().customItineraries.map((i) => i.osmRelationId)) - 1
    )
  }

  async function recompute(): Promise<void> {
    const { itineraries, customItineraries, tracks, toleranceMeters } = get()
    const sequence = ++recomputeSequence
    set({ matchingBusy: true })
    const trackPoints: LonLat[] = tracks.flatMap((t) => t.points)
    const computedAt = new Date().toISOString()
    const result = await computeMatching({
      itineraries,
      trackPoints,
      toleranceMeters,
      stepMeters: STEP_METERS,
      computedAt,
    })
    // Les itinéraires persos sont calculés à part : ils ne comptent pas dans
    // les statistiques globales des réseaux OSM.
    const customResult =
      customItineraries.length > 0
        ? await computeMatching({
            itineraries: customItineraries,
            trackPoints,
            toleranceMeters,
            stepMeters: STEP_METERS,
            computedAt,
          })
        : null
    // N'applique que le calcul le plus récent (l'utilisateur a pu re-régler).
    if (sequence === recomputeSequence) {
      const franchis = pctsPrecedents
        ? crossedMilestones(pctsPrecedents, result.results)
        : []
      pctsPrecedents = new Map(result.results.map((r) => [r.itineraryId, r.pct]))
      // Un seul franchissement annoncé à la fois : le plus haut. L'annonce
      // reste ensuite jusqu'à ce que l'utilisateur la referme — mais pas
      // au-delà de ce qu'elle raconte. L'effacer à chaque calcul la faisait
      // disparaître dans la seconde, à cause d'un recalcul de fond qu'on
      // n'avait pas demandé (démarrage, arrivée des boucles locales).
      const annonceEnCours = get().celebration
      const celebration =
        franchis[0] ??
        (annonceEnCours &&
        franchissementTientEncore(annonceEnCours, result.results)
          ? annonceEnCours
          : null)
      set({
        matching: result,
        customMatching: customResult,
        matchingBusy: false,
        celebration,
      })
    }
  }

  function setItineraries(
    zoneKey: string,
    zoneLabel: string,
    itineraries: Itinerary[],
    fetchedAt: string,
  ): void {
    // Un chargement explicite : ce n'est plus la zone restaurée au démarrage.
    set({ zoneRestoredAtStartup: false })
    // Nouvelle zone : les pourcentages précédents ne veulent plus rien dire,
    // et le bilan de sortie ouvert nomme des itinéraires qui ne sont plus là.
    pctsPrecedents = null
    set({
      celebration: null,
      outingDetail: null,
      zoneKey,
      zoneLabel,
      itineraries,
      zoneFetchedAt: fetchedAt,
      zoneLoading: false,
      zoneLoadStage: null,
      zoneLoadBytes: 0,
      zoneError: null,
      selectedItineraryId: null,
    })
  }

  async function loadFromOverpass(
    zoneKey: string,
    zoneLabel: string,
    query: string,
    force: boolean,
  ): Promise<void> {
    // Le numéro de séquence se prend AVANT tout `await`, sans exception.
    //
    // Ma première version sortait de la démonstration d'abord : un `await`
    // s'intercalait donc entre le clic et la prise du numéro, et deux
    // chargements lancés coup sur coup pouvaient franchir cette frontière
    // avant qu'aucun n'ait réservé le sien. Un test de recherche de ville a
    // échoué une fois sur la suite complète, et c'était la vraie cause —
    // pas une instabilité.
    const sequence = ++zoneLoadSequence
    // Entonnoir unique des trois chemins de zone (loadZone, loadRef,
    // loadAutour) : la garde vit ici plutôt qu'en trois exemplaires.
    //
    // Sans elle, charger une vraie zone pendant une démonstration laissait
    // les trois sorties fictives dans la liste, sur des itinéraires réels,
    // sous un bandeau annonçant toujours une démonstration. C'était le
    // cinquième chemin de contamination — après ceux que la revue du sprint
    // 2 avait fermés, et que sa PR déclarait exhaustifs.
    await sortirDeLaDemonstration(get)
    // Si l'utilisateur a annulé (ou relancé un autre chargement) entre-temps,
    // ce chargement ne doit plus toucher l'UI — mais on le laisse quand même
    // se terminer normalement : parsing et cache restent utiles en arrière-plan.
    const isCurrent = () => sequence === zoneLoadSequence
    set({
      zoneLoading: true,
      zoneError: null,
      zoneLoadStage: 'requesting',
      zoneLoadBytes: 0,
    })
    try {
      // Relu à chaque usage, jamais figé : au démarrage, la base s'ouvre
      // pendant que l'utilisateur clique une zone. Un `db` capturé à l'entrée
      // valait encore null au retour d'Overpass, deux minutes plus tard — la
      // zone n'était donc jamais mise en cache, et la visite suivante
      // repartait pour une interrogation complète.
      let cached
      try {
        const db = get().db
        cached = db ? await db.getZone(zoneKey) : undefined
      } catch {
        cached = undefined
      }
      if (!isCurrent()) return
      const now = new Date().toISOString()
      if (cached && !force && zoneUtilisable(cached, now)) {
        setItineraries(
          zoneKey,
          libelleDeZone(zoneKey, cached.label),
          cached.itineraries,
          cached.fetchedAt,
        )
        await persistLastZone(zoneKey)
        await recompute()
        return
      }

      try {
        const data = await fetchOverpass(query, {
          onAttempt: (mirrorIndex) => {
            if (isCurrent()) {
              set({
                zoneLoadStage: mirrorIndex === 0 ? 'requesting' : 'retrying',
                // Un second miroir repart de zéro : garder le compteur du
                // premier laisserait croire à une progression qui n'existe plus.
                zoneLoadBytes: 0,
              })
            }
          },
          onProgress: (octets) => {
            if (isCurrent()) set({ zoneLoadBytes: octets })
          },
        })
        if (!isCurrent()) return
        set({ zoneLoadStage: 'processing' })
        const itineraries = parseOverpassResponse(data, now)
        const db = await baseOuverte()
        if (db) {
          try {
            await db.saveZone({
              zoneKey,
              label: zoneLabel,
              itineraries,
              fetchedAt: now,
              schema: SCHEMA_ZONE,
            })
          } catch {
            // Quota de stockage dépassé (grosses zones) : on continue en
            // mémoire, le cache sera simplement absent au prochain démarrage.
          }
        }
        if (!isCurrent()) return
        // Enregistrée avant d'être affichée : si la zone est à l'écran, elle
        // sera restaurée au prochain démarrage. Dans l'autre ordre, recharger
        // la page dans la seconde qui suit interrompait l'écriture, et la
        // zone repartait pour une interrogation complète.
        await persistLastZone(zoneKey)
        setItineraries(zoneKey, zoneLabel, itineraries, now)
        if (itineraries.length === 0) {
          set({
            zoneError:
              'Aucun itinéraire balisé trouvé dans cette zone sur OpenStreetMap. Réessayez avec « Actualiser les tracés », ou choisissez une autre zone.',
          })
        }
        await recompute()
      } catch (error) {
        if (!isCurrent()) return
        // Miroirs injoignables : on retombe sur le cache même périmé.
        if (cached) {
          setItineraries(
            zoneKey,
            libelleDeZone(zoneKey, cached.label),
            cached.itineraries,
            cached.fetchedAt,
          )
          set({
            zoneError:
              'Les serveurs OpenStreetMap sont injoignables : affichage des tracés en cache (ils datent peut-être un peu).',
          })
          await persistLastZone(zoneKey)
          await recompute()
          return
        }
        const message =
          error instanceof OverpassError || error instanceof DbError
            ? error.message
            : 'Le chargement des tracés a échoué. Vérifiez votre connexion puis réessayez.'
        set({ zoneError: message })
      }
    } finally {
      // Quoi qu'il arrive, l'interface ne reste jamais bloquée en chargement —
      // sauf si un chargement plus récent (ou une annulation) a pris le relais.
      if (isCurrent() && get().zoneLoading) {
        set({ zoneLoading: false, zoneLoadStage: null, zoneLoadBytes: 0 })
      }
    }
  }

  /**
   * La base, une fois ouverte — en patientant si son ouverture est en cours.
   *
   * Au démarrage, `openSentiersDb()` prend quelques centaines de
   * millisecondes pendant lesquelles l'utilisateur clique déjà. Les écritures
   * lancées dans cette fenêtre trouvaient `db` à null et étaient perdues
   * sans erreur : la zone n'était pas mise en cache, et la visite suivante
   * repartait pour une interrogation complète d'Overpass.
   *
   * Rend `null` sans attendre si aucune ouverture n'est en cours — un store
   * dont `init()` n'a jamais été appelé ne doit pas se figer.
   */
  async function baseOuverte(): Promise<SentiersDb | null> {
    const dejaLa = get().db
    if (dejaLa) return dejaLa
    if (ouvertureBase) {
      try {
        await ouvertureBase
      } catch {
        // L'échec est déjà signalé par init() via dbWarning.
      }
    }
    return get().db
  }

  async function persistLastZone(zoneKey: string): Promise<void> {
    const db = await baseOuverte()
    if (db) await db.setSetting('lastZoneKey', zoneKey)
  }

  /**
   * Ajoute les boucles locales open data aux itinéraires de la zone affichée
   * (fusion en mémoire uniquement — jamais écrites dans le cache Overpass,
   * qui reste une copie pure d'OSM). Sans effet si la zone a changé entre
   * temps ou si l'asset est indisponible.
   */
  async function mergeLocalBoucles(zoneKey: string): Promise<void> {
    if (!ZONES_WITH_LOCAL_BOUCLES.has(zoneKey)) return
    const boucles = await fetchLocalBoucles()
    if (boucles.length === 0 || get().zoneKey !== zoneKey) return
    const known = new Set(get().itineraries.map((i) => i.osmRelationId))
    const fresh = boucles.filter((b) => !known.has(b.osmRelationId))
    if (fresh.length === 0) return
    set((state) => ({ itineraries: [...state.itineraries, ...fresh] }))
    await recompute()
  }

  return {
    db: null,
    dbWarning: null,
    zoneKey: null,
    zoneLabel: null,
    itineraries: [],
    zoneFetchedAt: null,
    zoneLoading: false,
    zoneLoadStage: null,
    zoneLoadBytes: 0,
    zoneError: null,
    tracks: [],
    sortiesReseau: [],

    // Enregistré sans passer par `set` immédiat sur chaque tuile : la
    // fusion par service borne le journal, et le rendu ne se déclenche que
    // lorsqu'un compteur change vraiment.
    noterSortieReseau(url) {
      set((etat) => ({ sortiesReseau: noterSortie(etat.sortiesReseau, url) }))
    },
    importErrors: [],
    importDoublons: [],
    demonstration: false,
    stockage: null,
    modeAffichage: 'complet',
    grosTexte: false,
    guideFerme: false,
    panneauReplie: false,
    backupMessage: null,
    lieux: [],
    lieuxLoading: false,
    lieuError: null,
    lieuxVides: false,
    objectifs: [],
    customItineraries: [],
    toleranceMeters: DEFAULT_TOLERANCE_METERS,
    completionPct: DEFAULT_COMPLETION_PCT,
    matching: null,
    customMatching: null,
    matchingBusy: false,
    selectedItineraryId: null,
    detailItineraryId: null,
    importProgress: null,
    zoneRestoredAtStartup: false,
    celebration: null,
    outingDetail: null,
    elevationProfile: null,
    elevationHover: null,
    elevationError: null,
    elevationLoading: false,
    pois: [],
    poisLoading: false,
    view3D: false,
    focusTarget: null,
    focusBounds: null,
    drawMode: false,
    drawWaypointKeys: [],
    drawWaypoints: [],
    drawPath: [],
    drawError: null,
    drawGainMeters: null,
    drawGainLoading: false,
    userPosition: null,
    geoWatching: false,
    geoError: null,

    async init() {
      let db: SentiersDb | null = null
      try {
        ouvertureBase = openSentiersDb()
        db = await ouvertureBase
        set({ db })
      } catch (error) {
        set({
          dbWarning:
            error instanceof DbError
              ? error.message
              : 'Le stockage local est indisponible : vos données ne seront pas conservées.',
        })
      }
      if (!db) return

      const [
        tracks,
        customItineraries,
        tolerance,
        completion,
        lastZoneKey,
        objectifsBruts,
        modeBrut,
        grosTexteBrut,
        guideFermeBrut,
        panneauReplieBrut,
      ] = await Promise.all([
        db.listTracks(),
        db.listCustomItineraries(),
        db.getSetting('toleranceMeters'),
        db.getSetting('completionPct'),
        db.getSetting('lastZoneKey'),
        db.getSetting('objectifs'),
        db.getSetting('modeAffichage'),
        db.getSetting('grosTexte'),
        db.getSetting('guideFerme'),
        db.getSetting('panneauReplie'),
      ])
      // Fusion, jamais remplacement : lire IndexedDB prend quelques centaines
      // de millisecondes, et l'utilisateur peut avoir déposé un fichier
      // entre-temps. Écraser la liste faisait disparaître sa trace sans un
      // mot — et le même fichier redéposé n'était même plus vu comme doublon.
      // Une démonstration lancée pendant l'ouverture de la base ne doit pas
      // recevoir les vraies données par-dessus : le visiteur qui revient
      // verrait ses sorties réelles et les trois fictives dans la même
      // liste et le même pourcentage, sans avoir rien fait pour cela.
      // `quitterDemonstration` relit la base, donc rien n'est perdu.
      const enDemonstration = get().demonstration
      set((etat) => ({
        tracks: enDemonstration ? etat.tracks : fusionner(tracks, etat.tracks),
        customItineraries: enDemonstration
          ? etat.customItineraries
          : fusionner(customItineraries, etat.customItineraries),
        // Chaque réglage passe par `repriseAuDemarrage` : ce que la
        // personne a changé pendant que la base s'ouvrait l'emporte sur ce
        // que la base contenait. Sans cela, un clic dans la première
        // seconde était annulé sans un mot (revue du sprint 6).
        toleranceMeters: repriseAuDemarrage(
          'toleranceMeters',
          typeof tolerance === 'number' ? tolerance : DEFAULT_TOLERANCE_METERS,
          etat.toleranceMeters,
        ),
        completionPct: repriseAuDemarrage(
          'completionPct',
          normalizeCompletionPct(completion),
          etat.completionPct,
        ),
        objectifs: repriseAuDemarrage(
          'objectifs',
          lireObjectifs(objectifsBruts),
          etat.objectifs,
        ),
        // Un réglage abîmé ou écrit par une version future ne doit pas
        // imposer un affichage que personne n'a demandé (issue #173).
        modeAffichage: repriseAuDemarrage(
          'modeAffichage',
          estModeAffichage(modeBrut) ? modeBrut : 'complet',
          etat.modeAffichage,
        ),
        grosTexte: repriseAuDemarrage(
          'grosTexte',
          lireDrapeau(grosTexteBrut),
          etat.grosTexte,
        ),
        guideFerme: repriseAuDemarrage(
          'guideFerme',
          lireDrapeau(guideFermeBrut),
          etat.guideFerme,
        ),
        panneauReplie: repriseAuDemarrage(
          'panneauReplie',
          lireDrapeau(panneauReplieBrut),
          etat.panneauReplie,
        ),
      }))

      // Rattrapage : ce qui a été importé pendant l'ouverture de la base n'y a
      // pas été écrit, faute de base à ce moment-là. Sans cela la trace
      // survivrait à l'affichage mais pas au rechargement suivant.
      const idsEnBase = new Set(tracks.map((trace) => trace.id))
      // Une démonstration lancée pendant l'ouverture de la base n'a rien à
      // faire en base : ce rattrapage écrit ce qui a été importé, pas ce qui
      // a été montré (issue #172).
      const aEcrire = get().demonstration
        ? []
        : get().tracks.filter((candidate) => !idsEnBase.has(candidate.id))
      for (const trace of aEcrire) {
        try {
          await db.saveTrack(trace)
        } catch {
          // Quota dépassé : la trace reste en mémoire pour cette session.
        }
      }
      const idsCustoms = new Set(
        customItineraries.map((itin) => itin.osmRelationId),
      )
      for (const itineraire of get().customItineraries.filter(
        (candidate) => !idsCustoms.has(candidate.osmRelationId),
      )) {
        try {
          await db.saveCustomItinerary(itineraire)
        } catch {
          // Idem : mémoire seulement.
        }
      }

      // Au démarrage, on restaure la dernière zone depuis le cache uniquement
      // (jamais d'appel réseau externe sans action de l'utilisateur — les
      // boucles locales sont un fichier du site, pas un service tiers).
      // Même raison : restaurer la zone en cache par-dessus une
      // démonstration mêlerait de vrais itinéraires à des sorties fictives.
      if (typeof lastZoneKey === 'string' && !get().demonstration) {
        const cached = await db.getZone(lastZoneKey)
        if (cached) {
          setItineraries(
            lastZoneKey,
            libelleDeZone(lastZoneKey, cached.label),
            cached.itineraries,
            cached.fetchedAt,
          )
          set({ zoneRestoredAtStartup: true })
        }
      }
      await recompute()
      if (typeof lastZoneKey === 'string' && !get().demonstration) {
        await mergeLocalBoucles(lastZoneKey)
      }
    },

    async loadZone(zoneId, options = {}) {
      const zone = ZONES.find((z) => z.id === zoneId)
      if (!zone) return
      const force = options.force ?? false
      if (force) {
        const { db } = get()
        if (db) await db.deleteZone(zoneId)
      }
      await loadFromOverpass(zoneId, zone.label, buildZoneQuery(zoneId), force)
      await mergeLocalBoucles(zoneId)
    },

    async loadRef(ref, options = {}) {
      const trimmed = ref.trim()
      if (!trimmed) return
      const force = options.force ?? false
      const zoneKey = `ref:${trimmed.toUpperCase()}`
      if (force) {
        const { db } = get()
        if (db) await db.deleteZone(zoneKey)
      }
      await loadFromOverpass(zoneKey, trimmed, buildRefQuery(trimmed), force)
    },

    cancelZoneLoad() {
      // Invalide le chargement en cours : sa promesse continue en arrière-plan
      // (le cache en profitera si elle aboutit) mais ne touchera plus l'UI.
      zoneLoadSequence += 1
      set({ zoneLoading: false, zoneLoadStage: null, zoneLoadBytes: 0 })
    },

    async importGpxFiles(files) {
      // « Maintenant, importez les vôtres » : la démonstration s'efface au
      // premier vrai fichier.
      await sortirDeLaDemonstration(get)
      const errors: string[] = []
      const imported: Track[] = []
      const developpement = await developperArchives(
        [...files],
        (filename, done, total) => {
          set({ importProgress: { done, total, filename } })
        },
      )
      errors.push(...developpement.erreurs)
      const liste = developpement.fichiers
      const knownFingerprints = new Map(
        get().tracks.map((t) => [trackFingerprint(t.points), t.filename]),
      )
      const doublons: DoublonEnAttente[] = []
      for (const [index, file] of liste.entries()) {
        try {
          set({
            importProgress: {
              done: index,
              total: liste.length,
              filename: file.name,
            },
          })
          // Laisse le navigateur peindre l'avancement avant le parsing, qui
          // bloque le fil principal (mesuré : ~320 ms pour un GPX de 9 Mo).
          await pause()
          const parsed = await parseTraceFile(file)
          // Signalé avant tout le reste : même une trace importée avec succès
          // doit dire ce qu'elle a perdu en chemin (issue #167).
          const horsLimites = messagePointsHorsLimites(parsed.pointsHorsLimites)
          if (horsLimites) errors.push(`${file.name} : ${horsLimites}`)
          // Une trace trop espacée ne peut pas être située : le dire à
          // l'import vaut mieux qu'un chiffre muet que l'utilisateur ne peut
          // pas comprendre (issue #148).
          const espacement = espacementTropGrand(parsed.points)
          if (espacement !== null) {
            errors.push(`${file.name} : ${messageTropEspacee(espacement)}`)
          }
          if (parsed.points.length === 0) {
            errors.push(
              `${file.name} : aucun point de trace exploitable dans ce fichier.`,
            )
            continue
          }
          const track: Track = {
            id: crypto.randomUUID(),
            filename: file.name,
            points: parsed.points,
            date: parsed.date,
            importedAt: new Date().toISOString(),
            elevationGain: elevationGainMeters(parsed.elevations),
            times: parsed.times,
            hdops: parsed.hdops,
            precisionsMetres: parsed.precisionsMetres,
          }
          const fingerprint = trackFingerprint(parsed.points)
          const ressembleA = knownFingerprints.get(fingerprint)
          if (ressembleA) {
            // L'empreinte ne lit pas tous les points : elle ne peut pas
            // affirmer l'identité, seulement la ressemblance. La trace est
            // mise de côté, prête à être ajoutée si la personne le dit
            // (issue #165) — pas jetée.
            doublons.push({
              id: track.id,
              filename: file.name,
              ressembleA,
              track,
            })
            continue
          }
          knownFingerprints.set(fingerprint, file.name)
          // La base est attendue si elle s'ouvre encore : pendant le
          // démarrage, un `db` figé à null aurait laissé la trace en mémoire
          // seulement.
          const db = await baseOuverte()
          if (db) {
            try {
              await db.saveTrack(track)
            } catch {
              // Quota de stockage dépassé. La lecture, elle, a parfaitement
              // réussi : la trace compte pour cette session, et seul le
              // rechargement suivant la perdra. Avant la revue du sprint 4,
              // cette erreur remontait dans le `catch` du fichier et
              // ressortait en « lecture impossible » — un reproche fait au
              // fichier pour une place qui manque. La trace était perdue
              // pour la session entière, sans que rien ne l'explique.
              errors.push(
                `${file.name} : plus de place pour enregistrer cette trace. Elle est comptée maintenant, mais elle aura disparu au prochain démarrage — exportez une sauvegarde ou supprimez des sorties.`,
              )
            }
          }
          imported.push(track)
        } catch (error) {
          errors.push(
            error instanceof GpxError ||
            error instanceof FitError ||
            error instanceof TcxError ||
            error instanceof GeoJsonError
              ? `${file.name} : ${error.message}`
              : `${file.name} : lecture impossible.`,
          )
        }
      }
      set({ importProgress: null })
      if (imported.length > 0) {
        set((state) => ({ tracks: [...state.tracks, ...imported] }))
        await recompute()
      }
      if (errors.length > 0) {
        set((state) => ({ importErrors: [...state.importErrors, ...errors] }))
      }
      if (doublons.length > 0) {
        set((state) => ({
          importDoublons: [...state.importDoublons, ...doublons],
        }))
      }
      if (imported.length > 0) await protegerLeStockage()
    },

    async importCustomGpx(files) {
      // « Maintenant, importez les vôtres » : la démonstration s'efface au
      // premier vrai fichier.
      await sortirDeLaDemonstration(get)
      const errors: string[] = []
      const imported: Itinerary[] = []
      let nextId = Math.min(
        0,
        ...get().customItineraries.map((i) => i.osmRelationId),
      )
      const liste = [...files]
      for (const [index, file] of liste.entries()) {
        try {
          set({
            importProgress: {
              done: index,
              total: liste.length,
              filename: file.name,
            },
          })
          await pause()
          const lecture = await lireItineraires(file)
          const horsLimites = messagePointsHorsLimites(lecture.pointsHorsLimites)
          if (horsLimites) errors.push(`${file.name} : ${horsLimites}`)
          const exploitables = lecture.trails.filter((trail) =>
            trail.lines.some((ligne) => ligne.length >= 2),
          )
          if (exploitables.length === 0) {
            errors.push(
              `${file.name} : pas assez de points pour en faire un itinéraire.`,
            )
            continue
          }
          const nomDeBase = file.name.replace(/\.(gpx|fit|tcx|geojson|json)$/i, '')
          const db = await baseOuverte()
          for (const [rang, trail] of exploitables.entries()) {
            nextId -= 1
            const ways = trail.lines
              .filter((ligne) => ligne.length >= 2)
              .map((ligne, index) => ({
                osmWayId: nextId * 1_000 - index,
                coords: ligne,
              }))
            const itinerary: Itinerary = {
              osmRelationId: nextId,
              ref: null,
              // Un GeoJSON peut décrire cent sentiers : chacun garde son nom,
              // et à défaut le fichier suivi de son rang — sans quoi la liste
              // afficherait cent fois la même ligne.
              name:
                trail.name ??
                (exploitables.length > 1
                  ? `${nomDeBase} (${rang + 1})`
                  : nomDeBase),
              network: 'PERSO',
              ways,
              totalMeters: ways.reduce(
                (somme, way) => somme + polylineLengthMeters(way.coords),
                0,
              ),
              fetchedAt: new Date().toISOString(),
            }
            if (db) await db.saveCustomItinerary(itinerary)
            imported.push(itinerary)
          }
        } catch (error) {
          errors.push(
            error instanceof GpxError ||
            error instanceof FitError ||
            error instanceof TcxError ||
            error instanceof GeoJsonError
              ? `${file.name} : ${error.message}`
              : `${file.name} : lecture impossible.`,
          )
        }
      }
      set({ importProgress: null })
      if (imported.length > 0) {
        set((state) => ({
          customItineraries: [...state.customItineraries, ...imported],
        }))
        await recompute()
      }
      if (errors.length > 0) {
        set((state) => ({ importErrors: [...state.importErrors, ...errors] }))
      }
    },

    async removeTrack(id) {
      const { db } = get()
      if (db) await db.deleteTrack(id)
      set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }))
      await recompute()
    },

    async removeCustomItinerary(id) {
      const { db } = get()
      if (db) await db.deleteCustomItinerary(id)
      if (get().detailItineraryId === id) get().closeItineraryDetail()
      set((state) => ({
        customItineraries: state.customItineraries.filter(
          (i) => i.osmRelationId !== id,
        ),
        selectedItineraryId:
          state.selectedItineraryId === id ? null : state.selectedItineraryId,
      }))
      await recompute()
    },

    async exporterSauvegarde() {
      // Une sauvegarde de démonstration n'aurait aucun sens, et rapporterait
      // des sorties fictives dans les vraies données au moment de la relire.
      await sortirDeLaDemonstration(get)
      const etat = get()
      const backup = buildBackup({
        tracks: etat.tracks,
        customItineraries: etat.customItineraries,
        settings: {
          toleranceMeters: etat.toleranceMeters,
          completionPct: etat.completionPct,
        },
        exportedAt: new Date().toISOString(),
      })
      const octets = await compresserBackup(serialiserBackup(backup))
      downloadBlob(
        backupFilename(backup.exportedAt),
        new Blob([octets as BlobPart], { type: 'application/gzip' }),
      )
    },

    async importerSauvegarde(file) {
      // Fusionner une sauvegarde avec des sorties fictives les laisserait en
      // mémoire, comptées dans les statistiques, jusqu'au rechargement
      // suivant (trouvé à la revue du sprint 2).
      await sortirDeLaDemonstration(get)
      let backup
      try {
        backup = await lireArchiveBackup(await file.arrayBuffer())
      } catch (error) {
        set((state) => ({
          importErrors: [
            ...state.importErrors,
            `${file.name} : ${
              error instanceof BackupError
                ? error.message
                : 'lecture impossible.'
            }`,
          ],
        }))
        return
      }

      const traces = fusionnerTraces(get().tracks, backup.tracks)
      const persos = fusionnerItineraires(
        get().customItineraries,
        backup.customItineraries,
      )

      const db = await baseOuverte()
      if (db) {
        for (const track of traces.tracks.slice(get().tracks.length)) {
          await db.saveTrack(track)
        }
        for (const itin of persos.itineraries.slice(
          get().customItineraries.length,
        )) {
          await db.saveCustomItinerary(itin)
        }
      }

      set({ tracks: traces.tracks, customItineraries: persos.itineraries })
      if (traces.ajoutees > 0 || persos.ajoutes > 0) await recompute()

      // Les réglages ne sont repris que s'ils sont présents : une sauvegarde
      // ne doit pas remettre la tolérance à zéro parce qu'elle est ancienne.
      if (typeof backup.settings.toleranceMeters === 'number') {
        await get().setTolerance(backup.settings.toleranceMeters)
      }
      if (typeof backup.settings.completionPct === 'number') {
        await get().setCompletionPct(backup.settings.completionPct)
      }

      set({
        backupMessage: resumeFusion(traces, persos),
      })
    },

    clearBackupMessage() {
      set({ backupMessage: null })
    },

    async chercherLieu(query) {
      const terme = query.trim()
      if (terme === '') {
        set({ lieux: [], lieuError: null, lieuxVides: false })
        return
      }
      const sequence = ++lieuSequence
      set({ lieuxLoading: true, lieuError: null, lieuxVides: false })
      try {
        const lieux = await chercherLieux(terme)
        // Une recherche plus récente a pris le relais : ses résultats sont
        // ceux que l'utilisateur attend, pas ceux d'une frappe abandonnée.
        if (sequence !== lieuSequence) return
        set({ lieux, lieuxVides: lieux.length === 0 })
      } catch (error) {
        if (sequence !== lieuSequence) return
        set({
          lieux: [],
          lieuError:
            error instanceof GeocodeError
              ? error.message
              : 'La recherche de lieu n’a pas abouti. Choisissez une zone dans la liste.',
        })
      } finally {
        if (sequence === lieuSequence) set({ lieuxLoading: false })
      }
    },

    async loadAutour(lieu, options = {}) {
      const [lon, lat] = lieu.center
      const zoneKey = `autour:${lon.toFixed(4)},${lat.toFixed(4)}`
      const force = options.force ?? false
      if (force) {
        const db = await baseOuverte()
        if (db) await db.deleteZone(zoneKey)
      }
      set({ lieux: [], lieuError: null, lieuxVides: false })
      await loadFromOverpass(
        zoneKey,
        `Autour de ${lieu.label}`,
        buildAroundQuery(lieu.center, RAYON_AUTOUR_METERS),
        force,
      )
    },

    async rafraichirZone() {
      const { zoneKey, zoneLabel } = get()
      if (!zoneKey) return
      // Une démonstration n'a pas de source à rafraîchir : elle se rejoue
      // ou se quitte, elle ne se recharge pas.
      if (get().demonstration) return
      if (zoneKey.startsWith('ref:')) {
        if (zoneLabel) await get().loadRef(zoneLabel, { force: true })
        return
      }
      if (zoneKey.startsWith('autour:')) {
        // La clé porte le centre de la recherche, précisément pour qu'on
        // puisse la rejouer sans avoir gardé le lieu d'origine.
        const [lon, lat] = zoneKey
          .slice('autour:'.length)
          .split(',')
          .map(Number)
        if (lon === undefined || lat === undefined) return
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return
        await get().loadAutour(
          {
            label: (zoneLabel ?? '').replace(/^Autour de /, ''),
            contexte: null,
            center: [lon, lat],
          },
          { force: true },
        )
        return
      }
      await get().loadZone(zoneKey, { force: true })
    },

    async basculerObjectif(id) {
      const actuels = get().objectifs
      const objectifs = actuels.includes(id)
        ? actuels.filter((autre) => autre !== id)
        : [...actuels, id]
      marquerTouche('objectifs')
      set({ objectifs })
      const db = await baseOuverte()
      if (db) await db.setSetting('objectifs', JSON.stringify(objectifs))
    },

    resumeDeLObjectif(id) {
      const { matching, itineraries, customItineraries } = get()
      const itineraire = [...itineraries, ...customItineraries].find(
        (i) => i.osmRelationId === id,
      )
      if (!itineraire || !matching) return null
      return resumeObjectif(itineraire, matching.samples, STEP_METERS)
    },

    effacerLieux() {
      lieuSequence += 1
      set({ lieux: [], lieuError: null, lieuxVides: false, lieuxLoading: false })
    },

    async setTolerance(value) {
      const clamped = Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, value))
      marquerTouche('toleranceMeters')
      set({ toleranceMeters: clamped })
      const { db } = get()
      if (db) await db.setSetting('toleranceMeters', clamped)
      await recompute()
    },

    async setCompletionPct(value) {
      // Aucun recalcul : le seuil ne change pas les pourcentages, seulement
      // le mot qu'on met dessus. Les composants le relisent au rendu.
      const seuil = normalizeCompletionPct(value)
      marquerTouche('completionPct')
      set({ completionPct: seuil })
      const db = await baseOuverte()
      if (db) await db.setSetting('completionPct', seuil)
    },

    selectItinerary(id) {
      set((state) => ({
        selectedItineraryId: id,
        // Changer la sélection depuis la liste ferme une fiche détail
        // ouverte pour un AUTRE itinéraire (elle n'a plus de sujet cohérent).
        ...(state.detailItineraryId !== null && state.detailItineraryId !== id
          ? {
              detailItineraryId: null,
              elevationProfile: null,
              elevationHover: null,
              elevationError: null,
              elevationLoading: false,
              pois: [],
              poisLoading: false,
              view3D: false,
            }
          : {}),
      }))
    },

    setElevationHover(point) {
      set({ elevationHover: point })
    },

    /**
     * Déplie (ou replie) le bilan d'une sortie : quels itinéraires balisés
     * elle a fait avancer, et de combien. Calculé à la demande — refaire le
     * matching pour chaque trace à chaque import coûterait cher pour une
     * information qu'on ne regarde qu'en cliquant.
     */
    async toggleOutingDetail(trackId) {
      if (get().outingDetail?.trackId === trackId) {
        set({ outingDetail: null })
        return
      }
      const { tracks, itineraries, customItineraries, toleranceMeters } = get()
      const track = tracks.find((t) => t.id === trackId)
      if (!track) return
      const sequence = ++outingSequence
      set({ outingDetail: { trackId, highlights: [], loading: true } })

      const tous = [...itineraries, ...customItineraries]
      const computedAt = new Date().toISOString()
      const resultat = await computeMatching({
        itineraries: tous,
        trackPoints: track.points,
        toleranceMeters,
        stepMeters: STEP_METERS,
        computedAt,
      })
      if (sequence !== outingSequence) return
      set({
        outingDetail: {
          trackId,
          highlights: outingHighlights(resultat.results, tous),
          loading: false,
        },
      })
    },

    dismissCelebration() {
      set({ celebration: null })
    },

    clearImportErrors() {
      set({ importErrors: [] })
    },

    async importerDoublon(id) {
      const doublon = get().importDoublons.find((d) => d.id === id)
      if (!doublon) return
      set((state) => ({
        importDoublons: state.importDoublons.filter((d) => d.id !== id),
      }))
      const db = await baseOuverte()
      if (db) await db.saveTrack(doublon.track)
      set((state) => ({ tracks: [...state.tracks, doublon.track] }))
      await recompute()
    },

    ignorerDoublon(id) {
      set((state) => ({
        importDoublons: state.importDoublons.filter((d) => d.id !== id),
      }))
    },

    async demarrerDemonstration() {
      // Les boucles locales sont embarquées avec le site : la démonstration
      // fonctionne hors ligne, sur des données réelles et licenciées, sans
      // faire attendre Overpass au tout premier écran.
      const boucles = await fetchLocalBoucles()
      const sorties = construireDemonstration(boucles)
      if (sorties.length === 0) {
        set({
          zoneError:
            'La démonstration n’a pas pu être préparée. Choisissez une zone pour commencer.',
        })
        return
      }
      const maintenant = new Date().toISOString()
      set({
        demonstration: true,
        itineraries: boucles,
        zoneKey: 'demonstration',
        zoneLabel: 'Démonstration — Métropole de Lyon',
        zoneError: null,
        zoneLoading: false,
        tracks: sorties.map((sortie) => ({
          id: `demo-${String(sortie.itineraire)}`,
          filename: sortie.nom,
          points: sortie.points,
          date: maintenant,
          importedAt: maintenant,
          elevationGain: null,
        })),
      })
      await recompute()
    },

    async setModeAffichage(mode) {
      marquerTouche('modeAffichage')
      set({ modeAffichage: mode })
      const db = await baseOuverte()
      if (db) await db.setSetting('modeAffichage', mode)
    },

    async setGrosTexte(actif) {
      marquerTouche('grosTexte')
      set({ grosTexte: actif })
      const db = await baseOuverte()
      // Pas de booléen dans le magasin des réglages : 0/1, relu par
      // lireDrapeau qui n'accepte que 1.
      if (db) await db.setSetting('grosTexte', actif ? 1 : 0)
    },

    async setGuideFerme(ferme) {
      marquerTouche('guideFerme')
      set({ guideFerme: ferme })
      const db = await baseOuverte()
      if (db) await db.setSetting('guideFerme', ferme ? 1 : 0)
    },

    async setPanneauReplie(replie) {
      marquerTouche('panneauReplie')
      set({ panneauReplie: replie })
      const db = await baseOuverte()
      if (db) await db.setSetting('panneauReplie', replie ? 1 : 0)
    },

    async rafraichirStockage() {
      set({ stockage: await etatDuStockage(apiDuNavigateur()) })
    },

    async arreterDemonstration() {
      if (!get().demonstration) return
      set((etat) => ({
        demonstration: false,
        // Les sorties fictives partent ; les boucles restent, elles sont
        // réelles. La zone est renommée pour ce qu'elle est vraiment.
        tracks: etat.tracks.filter((t) => !t.id.startsWith('demo-')),
        zoneKey: etat.zoneKey === 'demonstration' ? 'boucles-lyon' : etat.zoneKey,
        zoneLabel:
          etat.zoneKey === 'demonstration'
            ? 'Boucles communales — Métropole de Lyon'
            : etat.zoneLabel,
        celebration: null,
      }))
      await recompute()
    },

    async quitterDemonstration() {
      if (!get().demonstration) return
      set({
        demonstration: false,
        itineraries: [],
        tracks: [],
        zoneKey: null,
        zoneLabel: null,
        selectedItineraryId: null,
        detailItineraryId: null,
        celebration: null,
      })
      // La base n'a jamais rien reçu de la démonstration : il n'y a rien à
      // défaire, seulement à relire ce qui existait vraiment.
      const db = await baseOuverte()
      if (db) {
        const [tracks, customItineraries] = await Promise.all([
          db.listTracks(),
          db.listCustomItineraries(),
        ])
        set({ tracks, customItineraries })
      }
      await recompute()
    },

    ignorerTousDoublons() {
      // Redéposer une archive entière produit autant de propositions que de
      // sorties : sans ce geste, il faudrait les écarter une par une.
      set({ importDoublons: [] })
    },

    openItineraryDetail(id) {
      const sequence = ++detailSequence
      set({
        detailItineraryId: id,
        selectedItineraryId: id,
        view3D: false,
        elevationProfile: null,
        elevationHover: null,
        elevationError: null,
        elevationLoading: true,
        pois: [],
        poisLoading: true,
      })

      const { itineraries, customItineraries } = get()
      const itinerary =
        itineraries.find((i) => i.osmRelationId === id) ??
        customItineraries.find((i) => i.osmRelationId === id)
      const coords = itinerary ? itineraryCoords(itinerary) : []
      const applies = () =>
        sequence === detailSequence && get().detailItineraryId === id

      if (coords.length < 2) {
        set({ elevationLoading: false, poisLoading: false })
        return
      }

      void fetchElevationProfile(coords)
        .then((profile) => {
          if (applies()) set({ elevationProfile: profile, elevationLoading: false })
        })
        .catch((error: unknown) => {
          if (!applies()) return
          set({
            elevationLoading: false,
            elevationError:
              error instanceof ElevationError
                ? error.message
                : 'Profil altimétrique indisponible.',
          })
        })

      void fetchPois(coords).then((pois) => {
        if (applies()) set({ pois, poisLoading: false })
      })
    },

    closeItineraryDetail() {
      detailSequence += 1
      set({
        detailItineraryId: null,
        elevationProfile: null,
        elevationHover: null,
        elevationError: null,
        elevationLoading: false,
        pois: [],
        poisLoading: false,
        view3D: false,
      })
    },

    toggleView3D() {
      set((state) => ({ view3D: !state.view3D }))
    },

    focusOn(coords) {
      set({ focusTarget: coords })
    },

    clearFocusTarget() {
      set({ focusTarget: null })
    },

    focusOnBounds(bounds) {
      set({ focusBounds: bounds })
    },

    clearFocusBounds() {
      set({ focusBounds: null })
    },

    toggleDrawMode() {
      const active = !get().drawMode
      // La fiche détail occupe la même zone d'écran que le panneau de tracé.
      if (active && get().detailItineraryId !== null) {
        get().closeItineraryDetail()
      }
      set({
        drawMode: active,
        drawWaypointKeys: [],
        drawWaypoints: [],
        drawPath: [],
        drawError: null,
        drawGainMeters: null,
        drawGainLoading: false,
      })
    },

    addDrawPoint(point) {
      if (!get().drawMode) return
      const graph = routingGraph()
      const key = snapToNetwork(graph, point)
      if (!key) {
        set({
          drawError:
            'Aucun sentier à proximité de ce point : cliquez plus près d’un tracé affiché.',
        })
        return
      }
      const keys = [...get().drawWaypointKeys, key]
      const path = routeThrough(graph, keys)
      if (!path) {
        set({
          drawError:
            'Impossible de relier ce point au précédent en suivant les chemins : les deux tronçons ne se rejoignent pas dans les données affichées.',
        })
        return
      }
      set({
        drawWaypointKeys: keys,
        drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
        drawPath: path,
        drawError: null,
        // Le tracé a changé : le dénivelé affiché ne le décrit plus.
        drawGainMeters: null,
      })
    },

    allerRetourTrace() {
      appliquerClefs(clefsAllerRetour(get().drawWaypointKeys), 'aller-retour')
    },

    bouclerTrace() {
      appliquerClefs(clefsBouclees(get().drawWaypointKeys), 'boucle')
    },

    async estimerDeniveleTrace() {
      const { drawPath } = get()
      if (drawPath.length < 2 || get().drawGainLoading) return
      set({ drawGainLoading: true, drawError: null })
      try {
        // Une seule requête, à la fin : une par clic ferait vingt appels
        // pour un chiffre qui n'intéresse qu'au moment d'enregistrer.
        const profile = await fetchElevationProfile(drawPath)
        const stats = elevationStats(profile.elevations)
        set({
          drawGainMeters: stats ? Math.round(stats.gain) : null,
          // Un service qui répond sans une seule altitude n'est pas une
          // panne, mais ce n'est pas un chiffre non plus : le dire.
          ...(stats
            ? {}
            : {
                drawError:
                  'Le relief n’est pas disponible sur ce tracé : il reste enregistrable sans son dénivelé.',
              }),
        })
      } catch (error) {
        set({
          drawGainMeters: null,
          drawError:
            error instanceof ElevationError
              ? error.message
              : 'Le service altimétrique n’a pas répondu : le tracé reste enregistrable sans son dénivelé.',
        })
      } finally {
        set({ drawGainLoading: false })
      }
    },

    undoDrawPoint() {
      const keys = get().drawWaypointKeys.slice(0, -1)
      const graph = routingGraph()
      set({
        drawWaypointKeys: keys,
        drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
        drawPath: routeThrough(graph, keys) ?? [],
        drawError: null,
        drawGainMeters: null,
      })
    },

    async saveDrawnItinerary(name) {
      const { drawPath, db } = get()
      if (drawPath.length < 2) return
      const id = nextCustomId()
      const itinerary: Itinerary = {
        osmRelationId: id,
        ref: null,
        name: name.trim() || 'Itinéraire tracé',
        network: 'PERSO',
        ways: [{ osmWayId: id, coords: drawPath }],
        totalMeters: polylineLengthMeters(drawPath),
        fetchedAt: new Date().toISOString(),
      }
      if (db) await db.saveCustomItinerary(itinerary)
      set((state) => ({
        customItineraries: [...state.customItineraries, itinerary],
        drawMode: false,
        drawWaypointKeys: [],
        drawWaypoints: [],
        drawPath: [],
        drawError: null,
        drawGainMeters: null,
        selectedItineraryId: id,
      }))
      await recompute()
    },

    toggleGeolocation() {
      if (get().geoWatching) {
        if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId)
        geoWatchId = null
        set({ geoWatching: false, userPosition: null, geoError: null })
        return
      }
      if (!('geolocation' in navigator)) {
        set({
          geoError: 'Votre navigateur ne fournit pas la localisation.',
        })
        return
      }
      set({ geoWatching: true, geoError: null })
      geoWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const next: UserPosition = {
            lon: position.coords.longitude,
            lat: position.coords.latitude,
            accuracy: position.coords.accuracy,
          }
          // On ne recentre qu'au premier point : recentrer à chaque relevé
          // arracherait la carte des mains de qui la déplace.
          const isFirstFix = get().userPosition === null
          set({ userPosition: next, geoError: null })
          if (isFirstFix) get().focusOn([next.lon, next.lat])
        },
        (error: GeolocationPositionError) => {
          geoWatchId = null
          set({
            geoWatching: false,
            userPosition: null,
            geoError: geolocationErrorMessage(error.code),
          })
        },
        GEO_OPTIONS,
      )
    },
  }
})
