import { create } from 'zustand'
import {
  buildRefQuery,
  buildZoneQuery,
  fetchOverpass,
  parseOverpassResponse,
  OverpassError,
  ZONES,
} from '../core/overpass.ts'
import {
  parseGpx,
  GpxError,
  elevationGainMeters,
  trackFingerprint,
} from '../core/gpx.ts'
import { polylineLengthMeters } from '../core/sampling.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import { parseBouclesGeoJSON } from '../core/boucles.ts'
import {
  buildRoutingGraph,
  routeThrough,
  snapToNetwork,
  type RoutingGraph,
} from '../core/routing.ts'
import {
  fetchElevationProfile,
  ElevationError,
  type ProfilePoint,
} from '../core/elevation.ts'
import { fetchPois } from '../core/poi.ts'
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
  isFresh,
  DbError,
  type SentiersDb,
} from '../db/database.ts'
import { computeMatching } from './matchingClient.ts'

export const MIN_TOLERANCE = 25
export const MAX_TOLERANCE = 100

/** Étape affichée pendant zoneLoading, pour un retour visuel non figé. */
export type ZoneLoadStage = 'requesting' | 'retrying' | 'processing' | null

export interface AppState {
  // Persistance
  db: SentiersDb | null
  dbWarning: string | null

  // Zone chargée
  zoneKey: string | null
  zoneLabel: string | null
  itineraries: Itinerary[]
  zoneFetchedAt: string | null
  zoneLoading: boolean
  /** Étape en cours pendant zoneLoading, pour un retour visuel non figé. */
  zoneLoadStage: ZoneLoadStage
  zoneError: string | null

  // Traces GPX
  tracks: Track[]
  importErrors: string[]

  // Itinéraires créés par l'utilisateur (réseau PERSO, ids négatifs)
  customItineraries: Itinerary[]

  // Matching
  toleranceMeters: number
  matching: MatchResult | null
  /** Résultats des itinéraires persos, hors stats globales OSM. */
  customMatching: MatchResult | null
  matchingBusy: boolean

  // UI
  selectedItineraryId: number | null

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

  // Tracé d'itinéraire accroché aux sentiers affichés
  drawMode: boolean
  /** Clés de nœuds du graphe pour chaque étape posée. */
  drawWaypointKeys: string[]
  /** Coordonnées des étapes, pour les afficher sur la carte. */
  drawWaypoints: LonLat[]
  /** Tracé calculé qui suit les chemins entre les étapes. */
  drawPath: LonLat[]
  drawError: string | null

  // Position de l'utilisateur (API du navigateur, jamais transmise)
  userPosition: UserPosition | null
  geoWatching: boolean
  geoError: string | null

  init: () => Promise<void>
  loadZone: (zoneId: string, options?: { force?: boolean }) => Promise<void>
  loadRef: (ref: string, options?: { force?: boolean }) => Promise<void>
  /** Interrompt le chargement de zone en cours (l'appel réseau peut continuer
   *  en arrière-plan, mais son résultat n'est plus appliqué à l'UI). */
  cancelZoneLoad: () => void
  importGpxFiles: (files: Iterable<File>) => Promise<void>
  importCustomGpx: (files: Iterable<File>) => Promise<void>
  removeTrack: (id: string) => Promise<void>
  removeCustomItinerary: (id: number) => Promise<void>
  setTolerance: (value: number) => Promise<void>
  selectItinerary: (id: number | null) => void
  setElevationHover: (point: ProfilePoint | null) => void
  clearImportErrors: () => void
  openItineraryDetail: (id: number) => void
  closeItineraryDetail: () => void
  toggleView3D: () => void
  focusOn: (coords: LonLat) => void
  clearFocusTarget: () => void
  toggleDrawMode: () => void
  addDrawPoint: (point: LonLat) => void
  undoDrawPoint: () => void
  saveDrawnItinerary: (name: string) => Promise<void>
  toggleGeolocation: () => void
}

let recomputeSequence = 0
let detailSequence = 0
let zoneLoadSequence = 0
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
      set({ matching: result, customMatching: customResult, matchingBusy: false })
    }
  }

  function setItineraries(
    zoneKey: string,
    zoneLabel: string,
    itineraries: Itinerary[],
    fetchedAt: string,
  ): void {
    set({
      zoneKey,
      zoneLabel,
      itineraries,
      zoneFetchedAt: fetchedAt,
      zoneLoading: false,
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
    const sequence = ++zoneLoadSequence
    // Si l'utilisateur a annulé (ou relancé un autre chargement) entre-temps,
    // ce chargement ne doit plus toucher l'UI — mais on le laisse quand même
    // se terminer normalement : parsing et cache restent utiles en arrière-plan.
    const isCurrent = () => sequence === zoneLoadSequence
    set({ zoneLoading: true, zoneError: null, zoneLoadStage: 'requesting' })
    try {
      const { db } = get()
      let cached
      try {
        cached = db ? await db.getZone(zoneKey) : undefined
      } catch {
        cached = undefined
      }
      if (!isCurrent()) return
      const now = new Date().toISOString()
      if (cached && !force && isFresh(cached.fetchedAt, now)) {
        setItineraries(zoneKey, cached.label, cached.itineraries, cached.fetchedAt)
        await persistLastZone(zoneKey)
        await recompute()
        return
      }

      try {
        const data = await fetchOverpass(query, {
          onAttempt: (mirrorIndex) => {
            if (isCurrent()) {
              set({ zoneLoadStage: mirrorIndex === 0 ? 'requesting' : 'retrying' })
            }
          },
        })
        if (!isCurrent()) return
        set({ zoneLoadStage: 'processing' })
        const itineraries = parseOverpassResponse(data, now)
        if (db) {
          try {
            await db.saveZone({ zoneKey, label: zoneLabel, itineraries, fetchedAt: now })
          } catch {
            // Quota de stockage dépassé (grosses zones) : on continue en
            // mémoire, le cache sera simplement absent au prochain démarrage.
          }
        }
        if (!isCurrent()) return
        setItineraries(zoneKey, zoneLabel, itineraries, now)
        if (itineraries.length === 0) {
          set({
            zoneError:
              'Aucun itinéraire balisé trouvé dans cette zone sur OpenStreetMap. Réessayez avec « Actualiser les tracés », ou choisissez une autre zone.',
          })
        }
        await persistLastZone(zoneKey)
        await recompute()
      } catch (error) {
        if (!isCurrent()) return
        // Miroirs injoignables : on retombe sur le cache même périmé.
        if (cached) {
          setItineraries(zoneKey, cached.label, cached.itineraries, cached.fetchedAt)
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
        set({ zoneLoading: false, zoneLoadStage: null })
      }
    }
  }

  async function persistLastZone(zoneKey: string): Promise<void> {
    const { db } = get()
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
    zoneError: null,
    tracks: [],
    importErrors: [],
    customItineraries: [],
    toleranceMeters: DEFAULT_TOLERANCE_METERS,
    matching: null,
    customMatching: null,
    matchingBusy: false,
    selectedItineraryId: null,
    detailItineraryId: null,
    elevationProfile: null,
    elevationHover: null,
    elevationError: null,
    elevationLoading: false,
    pois: [],
    poisLoading: false,
    view3D: false,
    focusTarget: null,
    drawMode: false,
    drawWaypointKeys: [],
    drawWaypoints: [],
    drawPath: [],
    drawError: null,
    userPosition: null,
    geoWatching: false,
    geoError: null,

    async init() {
      let db: SentiersDb | null = null
      try {
        db = await openSentiersDb()
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

      const [tracks, customItineraries, tolerance, lastZoneKey] =
        await Promise.all([
          db.listTracks(),
          db.listCustomItineraries(),
          db.getSetting('toleranceMeters'),
          db.getSetting('lastZoneKey'),
        ])
      set({
        tracks,
        customItineraries,
        toleranceMeters:
          typeof tolerance === 'number' ? tolerance : DEFAULT_TOLERANCE_METERS,
      })

      // Au démarrage, on restaure la dernière zone depuis le cache uniquement
      // (jamais d'appel réseau externe sans action de l'utilisateur — les
      // boucles locales sont un fichier du site, pas un service tiers).
      if (typeof lastZoneKey === 'string') {
        const cached = await db.getZone(lastZoneKey)
        if (cached) {
          setItineraries(
            lastZoneKey,
            cached.label,
            cached.itineraries,
            cached.fetchedAt,
          )
        }
      }
      await recompute()
      if (typeof lastZoneKey === 'string') {
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
      set({ zoneLoading: false, zoneLoadStage: null })
    },

    async importGpxFiles(files) {
      const { db } = get()
      const errors: string[] = []
      const imported: Track[] = []
      const knownFingerprints = new Map(
        get().tracks.map((t) => [trackFingerprint(t.points), t.filename]),
      )
      for (const file of files) {
        try {
          const text = await file.text()
          const parsed = parseGpx(text, new DOMParser())
          if (parsed.points.length === 0) {
            errors.push(
              `${file.name} : aucun point de trace exploitable dans ce fichier.`,
            )
            continue
          }
          const fingerprint = trackFingerprint(parsed.points)
          const duplicateOf = knownFingerprints.get(fingerprint)
          if (duplicateOf) {
            errors.push(
              `${file.name} : identique à « ${duplicateOf} » déjà importée — ignorée.`,
            )
            continue
          }
          knownFingerprints.set(fingerprint, file.name)
          const track: Track = {
            id: crypto.randomUUID(),
            filename: file.name,
            points: parsed.points,
            date: parsed.date,
            importedAt: new Date().toISOString(),
            elevationGain: elevationGainMeters(parsed.elevations),
          }
          if (db) await db.saveTrack(track)
          imported.push(track)
        } catch (error) {
          errors.push(
            error instanceof GpxError
              ? `${file.name} : ${error.message}`
              : `${file.name} : lecture impossible.`,
          )
        }
      }
      if (imported.length > 0) {
        set((state) => ({ tracks: [...state.tracks, ...imported] }))
        await recompute()
      }
      if (errors.length > 0) {
        set((state) => ({ importErrors: [...state.importErrors, ...errors] }))
      }
    },

    async importCustomGpx(files) {
      const { db } = get()
      const errors: string[] = []
      const imported: Itinerary[] = []
      let nextId = Math.min(
        0,
        ...get().customItineraries.map((i) => i.osmRelationId),
      )
      for (const file of files) {
        try {
          const text = await file.text()
          const parsed = parseGpx(text, new DOMParser())
          if (parsed.points.length < 2) {
            errors.push(
              `${file.name} : pas assez de points pour en faire un itinéraire.`,
            )
            continue
          }
          nextId -= 1
          const itinerary: Itinerary = {
            osmRelationId: nextId,
            ref: null,
            name: file.name.replace(/\.gpx$/i, ''),
            network: 'PERSO',
            ways: [{ osmWayId: nextId, coords: parsed.points }],
            totalMeters: polylineLengthMeters(parsed.points),
            fetchedAt: new Date().toISOString(),
          }
          if (db) await db.saveCustomItinerary(itinerary)
          imported.push(itinerary)
        } catch (error) {
          errors.push(
            error instanceof GpxError
              ? `${file.name} : ${error.message}`
              : `${file.name} : lecture impossible.`,
          )
        }
      }
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

    async setTolerance(value) {
      const clamped = Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, value))
      set({ toleranceMeters: clamped })
      const { db } = get()
      if (db) await db.setSetting('toleranceMeters', clamped)
      await recompute()
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

    clearImportErrors() {
      set({ importErrors: [] })
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
      })
    },

    undoDrawPoint() {
      const keys = get().drawWaypointKeys.slice(0, -1)
      const graph = routingGraph()
      set({
        drawWaypointKeys: keys,
        drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
        drawPath: routeThrough(graph, keys) ?? [],
        drawError: null,
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
