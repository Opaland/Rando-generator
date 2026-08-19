import { create } from 'zustand'
import {
  buildRefQuery,
  buildZoneQuery,
  fetchOverpass,
  parseOverpassResponse,
  OverpassError,
  ZONES,
} from '../core/overpass.ts'
import { parseGpx, GpxError } from '../core/gpx.ts'
import type { MatchResult } from '../core/matching.ts'
import type { Itinerary, LonLat, Track } from '../core/types.ts'
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
  zoneError: string | null

  // Traces GPX
  tracks: Track[]
  importErrors: string[]

  // Matching
  toleranceMeters: number
  matching: MatchResult | null
  matchingBusy: boolean

  // UI
  selectedItineraryId: number | null

  init: () => Promise<void>
  loadZone: (zoneId: string, options?: { force?: boolean }) => Promise<void>
  loadRef: (ref: string) => Promise<void>
  importGpxFiles: (files: Iterable<File>) => Promise<void>
  removeTrack: (id: string) => Promise<void>
  setTolerance: (value: number) => Promise<void>
  selectItinerary: (id: number | null) => void
  clearImportErrors: () => void
}

let recomputeSequence = 0

export const useAppStore = create<AppState>()((set, get) => {
  async function recompute(): Promise<void> {
    const { itineraries, tracks, toleranceMeters } = get()
    const sequence = ++recomputeSequence
    set({ matchingBusy: true })
    const trackPoints: LonLat[] = tracks.flatMap((t) => t.points)
    const result = await computeMatching({
      itineraries,
      trackPoints,
      toleranceMeters,
      stepMeters: STEP_METERS,
      computedAt: new Date().toISOString(),
    })
    // N'applique que le calcul le plus récent (l'utilisateur a pu re-régler).
    if (sequence === recomputeSequence) {
      set({ matching: result, matchingBusy: false })
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
    const { db } = get()
    set({ zoneLoading: true, zoneError: null })

    const cached = db ? await db.getZone(zoneKey) : undefined
    const now = new Date().toISOString()
    if (cached && !force && isFresh(cached.fetchedAt, now)) {
      setItineraries(zoneKey, cached.label, cached.itineraries, cached.fetchedAt)
      await persistLastZone(zoneKey)
      await recompute()
      return
    }

    try {
      const data = await fetchOverpass(query)
      const itineraries = parseOverpassResponse(data, now)
      if (db) {
        await db.saveZone({ zoneKey, label: zoneLabel, itineraries, fetchedAt: now })
      }
      setItineraries(zoneKey, zoneLabel, itineraries, now)
      await persistLastZone(zoneKey)
      await recompute()
    } catch (error) {
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
      set({ zoneLoading: false, zoneError: message })
    }
  }

  async function persistLastZone(zoneKey: string): Promise<void> {
    const { db } = get()
    if (db) await db.setSetting('lastZoneKey', zoneKey)
  }

  return {
    db: null,
    dbWarning: null,
    zoneKey: null,
    zoneLabel: null,
    itineraries: [],
    zoneFetchedAt: null,
    zoneLoading: false,
    zoneError: null,
    tracks: [],
    importErrors: [],
    toleranceMeters: DEFAULT_TOLERANCE_METERS,
    matching: null,
    matchingBusy: false,
    selectedItineraryId: null,

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

      const [tracks, tolerance, lastZoneKey] = await Promise.all([
        db.listTracks(),
        db.getSetting('toleranceMeters'),
        db.getSetting('lastZoneKey'),
      ])
      set({
        tracks,
        toleranceMeters:
          typeof tolerance === 'number' ? tolerance : DEFAULT_TOLERANCE_METERS,
      })

      // Au démarrage, on restaure la dernière zone depuis le cache uniquement
      // (jamais d'appel réseau sans action de l'utilisateur).
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
    },

    async loadRef(ref) {
      const trimmed = ref.trim()
      if (!trimmed) return
      const zoneKey = `ref:${trimmed.toUpperCase()}`
      await loadFromOverpass(zoneKey, trimmed, buildRefQuery(trimmed), false)
    },

    async importGpxFiles(files) {
      const { db } = get()
      const errors: string[] = []
      const imported: Track[] = []
      for (const file of files) {
        try {
          const text = await file.text()
          const parsed = parseGpx(text, new DOMParser())
          if (parsed.points.length === 0) {
            errors.push(
              `${file.name} : aucun point de trace (trkpt) dans ce fichier.`,
            )
            continue
          }
          const track: Track = {
            id: crypto.randomUUID(),
            filename: file.name,
            points: parsed.points,
            date: parsed.date,
            importedAt: new Date().toISOString(),
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

    async removeTrack(id) {
      const { db } = get()
      if (db) await db.deleteTrack(id)
      set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }))
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
      set({ selectedItineraryId: id })
    },

    clearImportErrors() {
      set({ importErrors: [] })
    },
  }
})
