import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  openSentiersDb,
  isFresh,
  zoneUtilisable,
  SCHEMA_ZONE,
  CACHE_TTL_MS,
  DB_VERSION,
  DbError,
  type SentiersDb,
} from '../../src/db/database.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { Track } from '../../src/core/types.ts'

let db: SentiersDb
let counter = 0

beforeEach(async () => {
  // Un nom de base unique par test pour isoler les cas.
  counter += 1
  db = await openSentiersDb(`sentiers-test-${counter}`)
})

describe('openSentiersDb', () => {
  it('crée les stores attendus à la version courante', () => {
    expect(db.raw.version).toBe(DB_VERSION)
    expect(Array.from(db.raw.objectStoreNames).sort()).toEqual([
      'customItineraries',
      'enregistrement',
      'enregistrementPoints',
      'settings',
      'tracks',
      'zones',
    ])
  })

  it('migre une base v1 sans perdre les données existantes', async () => {
    const name = `sentiers-migration-${counter}`
    const { openDB } = await import('idb')
    const v1 = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('zones', { keyPath: 'zoneKey' })
        database.createObjectStore('tracks', { keyPath: 'id' })
        database.createObjectStore('settings')
      },
    })
    await v1.put('settings', 75, 'toleranceMeters')
    v1.close()

    const migrated = await openSentiersDb(name)
    expect(migrated.raw.version).toBe(DB_VERSION)
    expect(await migrated.getSetting('toleranceMeters')).toBe(75)
    expect(await migrated.listCustomItineraries()).toEqual([])
    migrated.raw.close()
  })

  it('peut être rouverte sans perte (migration idempotente)', async () => {
    await db.setSetting('toleranceMeters', 75)
    db.raw.close()
    const again = await openSentiersDb(`sentiers-test-${counter}`)
    expect(await again.getSetting('toleranceMeters')).toBe(75)
    again.raw.close()
  })

  it('lève une DbError en français si IndexedDB est indisponible', async () => {
    await expect(
      openSentiersDb('x', { indexedDB: undefined }),
    ).rejects.toThrow(DbError)
    await expect(
      openSentiersDb('x', { indexedDB: undefined }),
    ).rejects.toThrow(/navigateur/i)
  })
})

describe('cache des zones', () => {
  it('sauvegarde puis relit les itinéraires d’une zone', async () => {
    const itin = makeItinerary(1, [
      { osmWayId: 10, coords: straightLine(4.5, 45.4, 500, 100) },
    ])
    await db.saveZone({
      zoneKey: 'pilat',
      label: 'PNR du Pilat',
      itineraries: [itin],
      fetchedAt: '2026-02-01T12:00:00Z',
    })
    const cached = await db.getZone('pilat')
    expect(cached?.itineraries).toHaveLength(1)
    expect(cached?.itineraries[0]?.osmRelationId).toBe(1)
    expect(cached?.itineraries[0]?.ways[0]?.coords).toHaveLength(6)
  })

  it('retourne undefined pour une zone jamais chargée', async () => {
    expect(await db.getZone('inconnue')).toBeUndefined()
  })

  it('supprime une zone (bouton « actualiser les tracés »)', async () => {
    await db.saveZone({
      zoneKey: 'loire',
      label: 'Loire',
      itineraries: [],
      fetchedAt: '2026-02-01T12:00:00Z',
    })
    await db.deleteZone('loire')
    expect(await db.getZone('loire')).toBeUndefined()
  })
})

describe('isFresh (durée de vie du cache : 30 jours)', () => {
  it('est vrai à moins de 30 jours, faux au-delà', () => {
    const fetchedAt = '2026-01-01T00:00:00Z'
    expect(isFresh(fetchedAt, '2026-01-30T23:00:00Z')).toBe(true)
    expect(isFresh(fetchedAt, '2026-02-01T00:00:00Z')).toBe(false)
  })

  it('expose une constante de TTL de 30 jours', () => {
    expect(CACHE_TTL_MS).toBe(30 * 24 * 3600 * 1000)
  })

  it('est faux pour un horodatage illisible', () => {
    expect(isFresh('pas-une-date', '2026-02-01T00:00:00Z')).toBe(false)
  })
})

describe('traces GPX', () => {
  const track: Track = {
    id: 'uuid-1',
    filename: 'pilat.gpx',
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ],
    date: '2024-06-15T08:30:00Z',
    importedAt: '2026-02-01T12:00:00Z',
  }

  it('sauvegarde, liste et supprime des traces', async () => {
    await db.saveTrack(track)
    await db.saveTrack({ ...track, id: 'uuid-2', filename: 'b.gpx' })
    const all = await db.listTracks()
    expect(all.map((t) => t.id).sort()).toEqual(['uuid-1', 'uuid-2'])
    await db.deleteTrack('uuid-1')
    expect((await db.listTracks()).map((t) => t.id)).toEqual(['uuid-2'])
  })

  it('écrase une trace de même id (ré-import)', async () => {
    await db.saveTrack(track)
    await db.saveTrack({ ...track, filename: 'renommé.gpx' })
    const all = await db.listTracks()
    expect(all).toHaveLength(1)
    expect(all[0]?.filename).toBe('renommé.gpx')
  })
})

describe('itinéraires personnalisés', () => {
  it('sauvegarde, liste et supprime des itinéraires persos', async () => {
    const itin = makeItinerary(-1, [
      { osmWayId: -1, coords: straightLine(4.5, 45.4, 500, 100) },
    ], { network: 'PERSO', ref: null, name: 'Boucle du cartoguide' })
    await db.saveCustomItinerary(itin)
    const all = await db.listCustomItineraries()
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('Boucle du cartoguide')
    expect(all[0]?.network).toBe('PERSO')
    await db.deleteCustomItinerary(-1)
    expect(await db.listCustomItineraries()).toEqual([])
  })
})

describe('réglages', () => {
  it('lit et écrit la tolérance', async () => {
    expect(await db.getSetting('toleranceMeters')).toBeUndefined()
    await db.setSetting('toleranceMeters', 25)
    expect(await db.getSetting('toleranceMeters')).toBe(25)
  })
})

/**
 * Trouvaille de la revue du sprint 6.
 *
 * #179 a enrichi la requête Overpass sans toucher au cache, dont la durée
 * de vie est de trente jours. Une zone chargée la veille portait donc des
 * chemins sans tags — et le profil altimétrique affichait pour elle, mesuré,
 * une bande unique d'origine `inconnu` et la légende « Rien à en dire :
 * 100 % ». Ce n'est pas ce que dit OpenStreetMap : c'est ce qu'on ne lui a
 * pas demandé.
 */
describe('zoneUtilisable', () => {
  const zone = {
    zoneKey: 'pilat',
    label: 'Pilat',
    itineraries: [],
    fetchedAt: '2026-01-01T00:00:00Z',
  }
  const bientot = '2026-01-02T00:00:00Z'
  const plusTard = '2026-03-01T00:00:00Z'

  it('accepte une copie récente écrite à la version courante', () => {
    expect(zoneUtilisable({ ...zone, schema: SCHEMA_ZONE }, bientot)).toBe(true)
  })

  it('refuse une copie récente écrite avant que la version existe', () => {
    expect(zoneUtilisable(zone, bientot)).toBe(false)
  })

  it('refuse une copie à la bonne version mais périmée', () => {
    expect(zoneUtilisable({ ...zone, schema: SCHEMA_ZONE }, plusTard)).toBe(
      false,
    )
  })

  it('refuse une version qu’elle ne connaît pas', () => {
    expect(zoneUtilisable({ ...zone, schema: SCHEMA_ZONE + 1 }, bientot)).toBe(
      false,
    )
  })
})
