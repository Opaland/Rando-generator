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
  /**
   * Ce que la requête Overpass demandait au moment de l'écriture.
   *
   * Absent sur tout ce qui a été mis en cache avant #179 : la requête ne
   * demandait alors pas les tags des chemins, et les itinéraires stockés
   * n'en portent aucun. Le profil affichait pour eux « Rien à en dire :
   * 100 % » — mesuré : une bande d'origine `inconnu`, couvrant tout.
   * L'énoncé vrai n'était pas « OpenStreetMap ne dit rien », mais « on ne
   * l'a jamais demandé », et le cache tient trente jours.
   */
  schema?: number
}

/**
 * Version courante du contenu mis en cache pour une zone.
 *
 * À incrémenter quand la requête Overpass rapporte quelque chose de
 * nouveau, faute de quoi les copies plus anciennes prétendent répondre à
 * une question qu'on ne leur a pas posée. 1 = les tags de revêtement des
 * chemins membres (issue #179).
 */
export const SCHEMA_ZONE = 1

export type SettingKey =
  | 'toleranceMeters'
  | 'completionPct'
  | 'lastZoneKey'
  /** Itinéraires épinglés comme objectifs, en JSON (liste d'identifiants). */
  | 'objectifs'
  /** « complet » ou « simple » — deux registres, pas deux applications. */
  | 'modeAffichage'
  /** 0 ou 1, faute de booléen dans le magasin des réglages. */
  | 'grosTexte'
  /** 0 ou 1 : le guide de premier lancement a-t-il été fermé ? */
  | 'guideFerme'
  /** 0 ou 1 : le panneau latéral a-t-il été replié sur grand écran ? */
  | 'panneauReplie'

interface SentiersSchema extends DBSchema {
  zones: { key: string; value: CachedZone }
  tracks: { key: string; value: Track }
  settings: { key: string; value: number | string }
  /** Itinéraires créés par l'utilisateur (ids négatifs, réseau PERSO). */
  customItineraries: { key: number; value: Itinerary }
}

/**
 * La copie en cache répond-elle encore à la question qu'on pose aujourd'hui ?
 *
 * Deux conditions, et une seule fonction pour les porter : l'âge, et la
 * version du contenu. Les garder séparées aurait laissé le second oubli se
 * reproduire au prochain enrichissement de la requête (CLAUDE.md §4).
 */
export function zoneUtilisable(zone: CachedZone, nowIso: string): boolean {
  return zone.schema === SCHEMA_ZONE && isFresh(zone.fetchedAt, nowIso)
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
