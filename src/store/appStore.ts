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
import { GeocodeError, chercherLieux, type Lieu } from '../core/geocode.ts'
import { resumeObjectif, type ResumeObjectif } from '../core/objectifs.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import { parseBouclesGeoJSON } from '../core/boucles.ts'
import { outingHighlights, type OutingHighlight } from '../core/outing.ts'
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
import {
  crossedMilestones,
  DEFAULT_COMPLETION_PCT,
  franchissementTientEncore,
  normalizeCompletionPct,
} from '../core/milestones.ts'
import { fetchPois } from '../core/poi.ts'
import { reponseTronquee } from '../core/poisDeZone.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import type { PointOfInterest } from '../core/types.ts'
import { noterSortie, type EntreeJournal } from '../core/journalSortant.ts'
import {
  corpsContientUnPoint,
  echantillonDeTrace,
} from '../core/fuiteDeTrace.ts'

/**
 * Points surveillés par trace (issue #178).
 *
 * Douze : assez pour couvrir un départ, une arrivée et dix points entre les
 * deux, ce qui suffit à reconnaître une trace partie en entier ou par
 * morceaux. Pas cent, parce que la recherche tourne à chaque requête, sur
 * le fil principal.
 *
 * C'est un seuil de **détection** : il ne change rien à ce qui est envoyé,
 * seulement ce qu'on est capable de voir partir. Il est donc tranché au
 * jugement, et écrit ici (§2).
 */
const POINTS_SURVEILLES_PAR_TRACE = 12
import type { MatchResult } from '../core/matching.ts'
import {
  creerTrancheSortie,
  etatSortieInitial,
  type ActionsSortie,
  type EtatSortie,
} from './enregistrementSlice.ts'
import { creerVeilleGeo } from './veilleGeo.ts'
import { GEO_OPTIONS, geolocationErrorMessage } from '../core/geolocation.ts'
import type { Itinerary, LonLat, Track, UserPosition } from '../core/types.ts'
import { DEFAULT_TOLERANCE_METERS, STEP_METERS } from '../core/types.ts'
import {
  openSentiersDb,
  zoneUtilisable,
  SCHEMA_ZONE,
  DbError,
  type SentiersDb,
  type SettingKey,
} from '../db/database.ts'
import { ecrireReglage } from '../db/reglages.ts'
import {
  TRACE_VIDE,
  trancheTrace,
  type ActionsTrace,
  type EtatTrace,
} from './trancheTrace.ts'
import {
  FICHE_FERMEE,
  trancheFiche,
  type ActionsFiche,
  type EtatFiche,
} from './trancheFiche.ts'
export type { DoublonEnAttente } from './trancheImport.ts'
import {
  trancheImport,
  IMPORT_AU_REPOS,
  type ActionsImport,
  type EtatImport,
} from './trancheImport.ts'
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

export interface AppState
  extends
    EtatSortie,
    ActionsSortie,
    EtatTrace,
    ActionsTrace,
    EtatFiche,
    ActionsFiche,
    EtatImport,
    ActionsImport {
  // Persistance
  db: SentiersDb | null
  dbWarning: string | null

  /**
   * Ce qui est sorti de l'appareil depuis l'ouverture (issue #178).
   * En mémoire seulement : un compteur de vie privée qu'on persisterait
   * serait une ironie coûteuse.
   */
  sortiesReseau: EntreeJournal[]
  /**
   * Requêtes dont le corps portait un point de vos traces (issue #178).
   *
   * Il vaut zéro, et c'est le seul chiffre de l'application qu'on espère
   * voir rester à zéro. Il est **compté** et non écrit : jusqu'au 25/08,
   * l'interface affichait un `0` en dur, c'est-à-dire une promesse déguisée
   * en mesure.
   */
  requetesAvecTrace: number
  noterSortieReseau: (url: string, corps?: string | null) => void

  // Zone chargée
  zoneKey: string | null
  zoneLabel: string | null
  itineraries: Itinerary[]
  zoneFetchedAt: string | null
  zoneLoading: boolean
  /**
   * Les POI de la zone entière (issue #156), et ce qu'on en sait.
   *
   * Chargés **à la demande**, en une requête, jamais au chargement de la
   * zone : c'est une interrogation d'Overpass de plus, et #283 a montré ce
   * que coûte une requête lancée sans que personne l'ait demandée.
   */
  poisZone: PointOfInterest[]
  poisZoneLoading: boolean
  /**
   * `true` quand Overpass a rendu exactement son plafond de POI — donc
   * probablement pas tout. La liste doit le dire : sans ça, elle annoncerait
   * « pas d'eau » pour des itinéraires que la requête n'a pas eu la place de
   * couvrir.
   */
  poisZoneTronque: boolean
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
  /**
   * Itinéraires déclarés parcourus, sans trace GPX (issue #158).
   *
   * Volontairement à côté de `matching` et non dedans : le déclaratif
   * n'entre pas dans le pipeline, donc « prochaine sortie », les tronçons
   * restants et les séries continues l'ignorent par construction.
   */
  parcoursDeclares: ParcoursDeclare[]
  /** Coche un itinéraire comme parcouru, avec une date approximative. */
  declarerParcours: (itineraryId: number, date: string | null) => Promise<void>
  /** Décoche : on peut s'être trompé de sentier. */
  retirerParcoursDeclare: (itineraryId: number) => Promise<void>
  zoneError: string | null

  // Traces GPX
  tracks: Track[]
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

  // Position de l'utilisateur (API du navigateur, jamais transmise)
  /**
   * La sortie en cours d'enregistrement (issue #152).
   *
   * Une seule à la fois : on ne marche pas deux sentiers en même temps.
   * L'état et les actions vivent dans `enregistrementSlice.ts` — le store
   * ne fait que les héberger et leur prêter cinq fonctions.
   */
  userPosition: UserPosition | null
  geoWatching: boolean
  geoError: string | null

  init: () => Promise<void>
  loadZone: (zoneId: string, options?: { force?: boolean }) => Promise<void>
  /** Charge en une requête les POI de toute la zone (issue #156). */
  chargerPoisDeLaZone: () => Promise<void>
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
  toggleOutingDetail: (trackId: string) => Promise<void>
  dismissCelebration: () => void
  /** Passe outre le dédoublonnage et ajoute la trace pour de bon. */
  /** Retire la proposition sans rien importer. */
  /** Retire toutes les propositions d'un coup (réimport d'une archive entière). */
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
    .then((data: unknown) =>
      parseBouclesGeoJSON(data, new Date().toISOString()),
    )
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
  /**
   * Un seul suivi de position pour deux usages : la carte, qui montre où
   * l'on est, et l'enregistrement, qui retient par où l'on est passé. Le
   * comptage des demandeurs vit dans `veilleGeo.ts`, où il s'éprouve sans
   * navigateur.
   *
   * L'ordre des deux consommateurs compte : l'enregistrement passe avant le
   * recentrage de la carte, parce que perdre un point coûte plus cher qu'un
   * cadrage tardif.
   */
  const veille = creerVeilleGeo({
    geolocation: () =>
      'geolocation' in navigator ? navigator.geolocation : null,
    options: GEO_OPTIONS,
    surPosition: (position) => {
      sortie.surPosition(position)
      positionPourLaCarte(position)
    },
    surErreur: (erreur) => {
      sortie.surErreurGeo(erreur)
      erreurPourLaCarte(erreur)
    },
  })

  /**
   * L'enregistrement d'une sortie (issue #152), avec des ports étroits.
   *
   * Cinq fonctions, et pas le store entier : c'est ce qui permet de dérouler
   * la mécanique complète dans un test unitaire — file d'écriture, compteur
   * de points, reprise après un onglet tué, passage en pause sur erreur GPS.
   */
  const sortie = creerTrancheSortie({
    lire: () => get(),
    poser: (partiel) => {
      set(partiel)
    },
    base: () => get().db,
    rangerTrace: async (trace) => {
      set((etat) => ({ tracks: [...etat.tracks, trace] }))
      const base = get().db
      if (base) {
        try {
          await base.saveTrack(trace)
        } catch {
          // Quota dépassé : la trace reste en mémoire pour cette session.
        }
      }
      await recompute()
    },
    quitterDemonstration: () => {
      void sortirDeLaDemonstration(get)
    },
    veille,
  })

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
      pctsPrecedents = new Map(
        result.results.map((r) => [r.itineraryId, r.pct]),
      )
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
        } else if (data.remark !== undefined) {
          // Overpass a rendu des données **et** un motif : il a interrompu la
          // requête en cours de route. Ce qui est à l'écran est un morceau de
          // la zone, et rien ne le distingue d'une zone complète — sauf de le
          // dire. Une complétion calculée là-dessus serait fausse par excès.
          set({
            zoneError:
              'Les serveurs OpenStreetMap ont interrompu la requête : cette zone n’est affichée qu’en partie. Vos pourcentages sont donc surestimés. Essayez un secteur plus petit pour l’avoir en entier.',
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
   * Enregistre un réglage, et le montre — dans cet ordre, sans attente
   * entre les deux (issue #203).
   *
   * Les sept setters faisaient :
   *
   *     set({ completionPct: seuil })          // l'écran change tout de suite
   *     const db = await baseOuverte()
   *     if (db) await db.setSetting(…, seuil)  // la base apprend après
   *
   * Entre les deux, l'interface affirmait quelque chose que la base ne savait
   * pas encore. Un rechargement dans cette fenêtre annulait la transaction, et
   * le réglage revenait à sa valeur précédente **alors que la personne l'avait
   * vu changer**.
   *
   * `ecrireReglage` écrit dans `localStorage`, dont le contrat est synchrone :
   * quand il rend la main, c'est écrit. Il n'y a plus de fenêtre à fermer — il
   * n'y a plus de fenêtre, et l'écran répond toujours dans le même geste.
   *
   * **Montrer après avoir écrit** a été essayé et abandonné : une case cochée
   * contrôlée par React revient visiblement à son ancien état le temps de
   * l'écriture. Vingt-trois tests de bout en bout l'ont dit d'une seule voix.
   * Échanger une perte rare contre un sursaut à chaque clic n'est pas un
   * progrès. Le détail est dans `db/reglages.ts`.
   *
   * Le repli sur IndexedDB n'est pas décoratif : certains navigateurs
   * verrouillent `localStorage` et pas l'autre. La fenêtre de #203 revient
   * alors, et c'est dit plutôt que masqué.
   *
   * Une fonction nommée plutôt que sept séquences recopiées (§4) — c'est
   * l'ancienne forme qui le montre le mieux : sept copies du même défaut.
   */
  async function enregistrerReglage(
    clef: SettingKey,
    valeur: string | number,
    appliquer: () => void,
  ): Promise<void> {
    marquerTouche(clef)
    const ecrit = ecrireReglage(clef, valeur)
    appliquer()
    if (ecrit) return
    const db = await baseOuverte()
    if (db) await db.setSetting(clef, valeur)
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
    poisZone: [],
    poisZoneLoading: false,
    poisZoneTronque: false,
    zoneLoadStage: null,
    zoneLoadBytes: 0,
    zoneError: null,
    tracks: [],
    sortiesReseau: [],
    requetesAvecTrace: 0,

    // Enregistré sans passer par `set` immédiat sur chaque tuile : la
    // fusion par service borne le journal, et le rendu ne se déclenche que
    // lorsqu'un compteur change vraiment.
    noterSortieReseau(url, corps) {
      set((etat) => {
        /*
          L'échantillon se refait à chaque requête plutôt que d'être gardé
          en mémoire. C'est un choix mesurable : douze points par trace,
          quatre écritures chacun, contre un champ de plus à tenir d'accord
          avec `tracks` à chaque import, suppression et restauration — le
          §4 en germe. Si le coût se voyait un jour, il se mémoïserait.
        */
        const echantillon = etat.tracks.flatMap((trace) =>
          echantillonDeTrace(trace.points, POINTS_SURVEILLES_PAR_TRACE),
        )
        const emporte = corpsContientUnPoint(corps, echantillon)
        return {
          sortiesReseau: noterSortie(etat.sortiesReseau, url),
          requetesAvecTrace: etat.requetesAvecTrace + (emporte ? 1 : 0),
        }
      })
    },
    ...IMPORT_AU_REPOS,
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
    parcoursDeclares: [],
    customItineraries: [],
    toleranceMeters: DEFAULT_TOLERANCE_METERS,
    completionPct: DEFAULT_COMPLETION_PCT,
    matching: null,
    customMatching: null,
    matchingBusy: false,
    selectedItineraryId: null,
    zoneRestoredAtStartup: false,
    celebration: null,
    outingDetail: null,
    ...FICHE_FERMEE,
    focusTarget: null,
    focusBounds: null,
    ...TRACE_VIDE,
    userPosition: null,
    geoWatching: false,
    geoError: null,
    ...etatSortieInitial(),

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
        declaresEnBase,
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
        db.listerParcoursDeclares(),
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
        /*
          Même raison que pour les traces : cocher un itinéraire pendant que
          la base s'ouvre ne doit pas être annulé sans un mot. Ce qui est
          déjà à l'écran l'emporte, le reste s'ajoute.
        */
        parcoursDeclares: enDemonstration
          ? etat.parcoursDeclares
          : [
              ...etat.parcoursDeclares,
              ...declaresEnBase.filter(
                (d) =>
                  !etat.parcoursDeclares.some(
                    (deja) => deja.itineraryId === d.itineraryId,
                  ),
              ),
            ],
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

      await sortie.reprendreAuDemarrage(db)

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

    /**
     * Charge en **une** requête les points d'intérêt de la zone entière
     * (issue #156), pour que la liste puisse dire où se trouve l'eau.
     *
     * À la demande, jamais automatiquement. C'est une interrogation
     * d'Overpass de plus, et #283 a montré ce que coûte une requête que
     * personne n'a demandée : quand elle échoue, c'est l'application qui
     * paraît fautive.
     *
     * Une requête pour toute la zone plutôt qu'une par itinéraire : la
     * seconde forme ferait des centaines d'appels, et se ferait couper par
     * le serveur bien avant la fin.
     */
    async chargerPoisDeLaZone() {
      const { itineraries, poisZoneLoading } = get()
      if (poisZoneLoading || itineraries.length === 0) return
      set({ poisZoneLoading: true })
      try {
        const coords = itineraries.flatMap((itin) => itineraryCoords(itin))
        const pois = await fetchPois(coords)
        set({
          poisZone: pois,
          poisZoneTronque: reponseTronquee(pois),
          poisZoneLoading: false,
        })
      } catch {
        // Un POI est un bonus, jamais bloquant : en cas d'échec on rend la
        // main sans rien afficher de plus. `fetchPois` ne lève déjà pas,
        // mais le `catch` garde le drapeau de chargement d'être laissé à
        // `true` si un jour elle changeait d'avis.
        set({ poisZoneLoading: false })
      }
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
        // Sans cela, quinze PR cochés à la main disparaîtraient au premier
        // changement de navigateur — et la sauvegarde, « la seule copie qui
        // vous appartienne », mentirait par omission (issue #158).
        parcoursDeclares: etat.parcoursDeclares,
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

      /*
        Les déclarations se fusionnent comme le reste : ce qui est déjà là
        l'emporte, la sauvegarde complète. Écraser ferait disparaître une
        déclaration faite depuis l'export, exactement comme cela arrivait
        aux traces avant qu'on le corrige.
      */
      const declaresFusionnes = [
        ...get().parcoursDeclares,
        ...backup.parcoursDeclares.filter(
          (d) =>
            !get().parcoursDeclares.some(
              (deja) => deja.itineraryId === d.itineraryId,
            ),
        ),
      ]
      if (db) {
        for (const declaration of declaresFusionnes) {
          await db.declarerParcours(declaration)
        }
      }

      set({
        tracks: traces.tracks,
        customItineraries: persos.itineraries,
        parcoursDeclares: declaresFusionnes,
      })
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
      await enregistrerReglage('objectifs', JSON.stringify(objectifs), () => {
        set({ objectifs })
      })
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
      set({
        lieux: [],
        lieuError: null,
        lieuxVides: false,
        lieuxLoading: false,
      })
    },

    /*
      Cocher un itinéraire (issue #158).

      L'état part en premier et la base suit, comme partout ailleurs ici :
      c'est la fenêtre décrite par #203, connue et non tranchée. Ce qui
      compte pour cette issue-là, c'est ailleurs — le déclaratif n'entre
      jamais dans `matching`, donc rien de ce qui suppose une géométrie
      réelle ne peut s'en nourrir.
    */
    async declarerParcours(itineraryId, date) {
      const parcours = {
        itineraryId,
        date,
        declareLe: new Date().toISOString(),
      }
      set((etat) => ({
        parcoursDeclares: [
          ...etat.parcoursDeclares.filter((d) => d.itineraryId !== itineraryId),
          parcours,
        ],
      }))
      const db = await baseOuverte()
      if (db) await db.declarerParcours(parcours)
    },

    async retirerParcoursDeclare(itineraryId) {
      set((etat) => ({
        parcoursDeclares: etat.parcoursDeclares.filter(
          (d) => d.itineraryId !== itineraryId,
        ),
      }))
      const db = await baseOuverte()
      if (db) await db.retirerParcoursDeclare(itineraryId)
    },

    async setTolerance(value) {
      const clamped = Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, value))
      await enregistrerReglage('toleranceMeters', clamped, () => {
        set({ toleranceMeters: clamped })
      })
      await recompute()
    },

    async setCompletionPct(value) {
      // Aucun recalcul : le seuil ne change pas les pourcentages, seulement
      // le mot qu'on met dessus. Les composants le relisent au rendu.
      const seuil = normalizeCompletionPct(value)
      await enregistrerReglage('completionPct', seuil, () => {
        set({ completionPct: seuil })
      })
    },

    selectItinerary(id) {
      set((state) => ({
        selectedItineraryId: id,
        // Changer la sélection depuis la liste ferme une fiche détail
        // ouverte pour un AUTRE itinéraire (elle n'a plus de sujet cohérent).
        ...(state.detailItineraryId !== null && state.detailItineraryId !== id
          ? FICHE_FERMEE
          : {}),
      }))
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
      await enregistrerReglage('modeAffichage', mode, () => {
        set({ modeAffichage: mode })
      })
    },

    async setGrosTexte(actif) {
      // Pas de booléen dans le magasin des réglages : 0/1, relu par
      // lireDrapeau qui n'accepte que 1.
      await enregistrerReglage('grosTexte', actif ? 1 : 0, () => {
        set({ grosTexte: actif })
      })
    },

    async setGuideFerme(ferme) {
      await enregistrerReglage('guideFerme', ferme ? 1 : 0, () => {
        set({ guideFerme: ferme })
      })
    },

    async setPanneauReplie(replie) {
      await enregistrerReglage('panneauReplie', replie ? 1 : 0, () => {
        set({ panneauReplie: replie })
      })
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
        zoneKey:
          etat.zoneKey === 'demonstration' ? 'boucles-lyon' : etat.zoneKey,
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
      /*
        La base n'a jamais rien reçu de la démonstration : il n'y a rien à
        défaire, seulement à relire ce qui existait vraiment.

        Les déclarations (#158) manquaient à cette relecture — elles
        n'existaient pas quand elle a été écrite, et le commentaire affirmait
        pourtant « rien n'est perdu ». Trouvé à la revue du sprint.

        Le défaut est **latent et non atteignable aujourd'hui** : l'entrée de
        la démonstration ne vit que dans le guide de premier lancement, qu'un
        revenant — le seul à pouvoir avoir des déclarations — a déjà fermé.
        C'est un accident de navigation qui protège, pas une garantie ; la
        relecture est donc rendue symétrique de celle des traces plutôt que
        laissée à cet accident.
      */
      const db = await baseOuverte()
      if (db) {
        const [tracks, customItineraries, parcoursDeclares] = await Promise.all(
          [
            db.listTracks(),
            db.listCustomItineraries(),
            db.listerParcoursDeclares(),
          ],
        )
        set({ tracks, customItineraries, parcoursDeclares })
      }
      await recompute()
    },

    ...trancheImport({
      set,
      etat: () => get(),
      baseOuverte,
      recompute,
      protegerLeStockage,
      sortirDeLaDemonstration: () => sortirDeLaDemonstration(get),
      /*
        La fiche se ferme si elle montre l'itinéraire qu'on supprime.

        Passé en dépendance nommée plutôt que lu depuis `get()` : la tranche
        n'a pas à savoir que la fiche détail existe, encore moins comment
        elle s'appelle. C'est ce qui a rendu le couplage visible en écrivant
        cette liste — l'import touche à sept choses distinctes, et il fallait
        les nommer une à une pour s'en apercevoir.
      */
      fermerLaFicheSi: (id) => {
        if (get().detailItineraryId === id) get().closeItineraryDetail()
      },
    }),

    ...trancheFiche({
      set,
      etatFiche: () => get(),
      itineraireParId: (id) => {
        const { itineraries, customItineraries } = get()
        return (
          itineraries.find((i) => i.osmRelationId === id) ??
          customItineraries.find((i) => i.osmRelationId === id)
        )
      },
      poisEmportes: async (id) => {
        const base = await baseOuverte()
        return (await base?.lirePoisEmportes(id)) ?? null
      },
    }),

    ...trancheTrace({
      set,
      etatTrace: () => get(),
      itinerairesDuGraphe: () => ({
        balises: get().itineraries,
        perso: get().customItineraries,
      }),
      prochainIdentifiantPerso: nextCustomId,
      ficheOuverte: () => get().detailItineraryId !== null,
      fermerLaFiche: () => {
        get().closeItineraryDetail()
      },
      async enregistrerLeTrace(itineraire) {
        const { db } = get()
        if (db) await db.saveCustomItinerary(itineraire)
        set((state) => ({
          customItineraries: [...state.customItineraries, itineraire],
          ...TRACE_VIDE,
          selectedItineraryId: itineraire.osmRelationId,
        }))
        await recompute()
      },
    }),

    toggleGeolocation() {
      if (get().geoWatching) {
        veille.arreter('carte')
        set({ geoWatching: false, userPosition: null, geoError: null })
        return
      }
      if (!veille.demarrer('carte')) {
        set({
          geoError: 'Votre navigateur ne fournit pas la localisation.',
        })
        return
      }
      set({ geoWatching: true, geoError: null })
    },

    ...sortie.actions,
  }

  /**
   * Ce que la carte fait d'une position reçue.
   *
   * La sortie en enregistre une copie de son côté (`enregistrementSlice`) ;
   * ici on ne s'occupe que du point bleu et du premier cadrage.
   */
  function positionPourLaCarte(position: GeolocationPosition): void {
    if (!get().geoWatching) return
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
  }

  function erreurPourLaCarte(error: GeolocationPositionError): void {
    set({
      geoWatching: false,
      userPosition: null,
      geoError: geolocationErrorMessage(error.code),
    })
  }
})
