import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Itinerary, Track } from '../core/types.ts'

/** Erreur de persistance, message affichable tel quel à l'utilisateur. */
export class DbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DbError'
  }
}

export const DB_NAME = 'sentiers'
export const DB_VERSION = 2

/** Durée de vie du cache des tracés : 30 jours. */
export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000

/** Zone (ou recherche par ref) mise en cache avec ses itinéraires. */
export interface CachedZone {
  zoneKey: string
  label: string
  itineraries: Itinerary[]
  fetchedAt: string
}

export type SettingKey =
  | 'toleranceMeters'
  | 'completionPct'
  | 'lastZoneKey'
  /** Itinéraires épinglés comme objectifs, en JSON (liste d'identifiants). */
  | 'objectifs'

interface SentiersSchema extends DBSchema {
  zones: { key: string; value: CachedZone }
  tracks: { key: string; value: Track }
  settings: { key: string; value: number | string }
  /** Itinéraires créés par l'utilisateur (ids négatifs, réseau PERSO). */
  customItineraries: { key: number; value: Itinerary }
}

/** Vrai si un horodatage ISO a moins de CACHE_TTL_MS d'ancienneté à `nowIso`. */
export function isFresh(fetchedAtIso: string, nowIso: string): boolean {
  const fetchedAt = Date.parse(fetchedAtIso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(fetchedAt) || Number.isNaN(now)) return false
  return now - fetchedAt < CACHE_TTL_MS
}

export interface SentiersDb {
  raw: IDBPDatabase<SentiersSchema>
  saveZone(zone: CachedZone): Promise<void>
  getZone(zoneKey: string): Promise<CachedZone | undefined>
  deleteZone(zoneKey: string): Promise<void>
  saveTrack(track: Track): Promise<void>
  listTracks(): Promise<Track[]>
  deleteTrack(id: string): Promise<void>
  saveCustomItinerary(itinerary: Itinerary): Promise<void>
  listCustomItineraries(): Promise<Itinerary[]>
  deleteCustomItinerary(id: number): Promise<void>
  getSetting(key: SettingKey): Promise<number | string | undefined>
  setSetting(key: SettingKey, value: number | string): Promise<void>
}

export interface OpenDbOptions {
  /** Injectable pour les tests ; par défaut, l'IndexedDB du navigateur. */
  indexedDB?: IDBFactory | undefined
}

/**
 * Ouvre (et migre si besoin) la base IndexedDB de l'application.
 * Lève une DbError en français si IndexedDB est indisponible (navigation
 * privée de certains navigateurs, stockage désactivé…).
 */
export async function openSentiersDb(
  name: string = DB_NAME,
  options: OpenDbOptions = {},
): Promise<SentiersDb> {
  const factory =
    'indexedDB' in options
      ? options.indexedDB
      : (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!factory) {
    throw new DbError(
      'Votre navigateur bloque le stockage local (IndexedDB). ' +
        'Vos traces ne pourront pas être conservées entre deux visites : ' +
        'désactivez la navigation privée ou autorisez le stockage pour ce site.',
    )
  }

  let raw: IDBPDatabase<SentiersSchema>
  try {
    raw = await openDB<SentiersSchema>(name, DB_VERSION, {
      upgrade(database, oldVersion) {
        // Migrations incrémentales : chaque version ajoute ses stores.
        if (oldVersion < 1) {
          database.createObjectStore('zones', { keyPath: 'zoneKey' })
          database.createObjectStore('tracks', { keyPath: 'id' })
          database.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          database.createObjectStore('customItineraries', {
            keyPath: 'osmRelationId',
          })
        }
      },
    })
  } catch {
    throw new DbError(
      'Impossible d’ouvrir le stockage local (IndexedDB). ' +
        'Rechargez la page ; si le problème persiste, videz les données du site.',
    )
  }

  return {
    raw,
    async saveZone(zone) {
      await raw.put('zones', zone)
    },
    getZone(zoneKey) {
      return raw.get('zones', zoneKey)
    },
    async deleteZone(zoneKey) {
      await raw.delete('zones', zoneKey)
    },
    async saveTrack(track) {
      await raw.put('tracks', track)
    },
    listTracks() {
      return raw.getAll('tracks')
    },
    async deleteTrack(id) {
      await raw.delete('tracks', id)
    },
    async saveCustomItinerary(itinerary) {
      await raw.put('customItineraries', itinerary)
    },
    listCustomItineraries() {
      return raw.getAll('customItineraries')
    },
    async deleteCustomItinerary(id) {
      await raw.delete('customItineraries', id)
    },
    getSetting(key) {
      return raw.get('settings', key)
    },
    async setSetting(key, value) {
      await raw.put('settings', value, key)
    },
  }
}
