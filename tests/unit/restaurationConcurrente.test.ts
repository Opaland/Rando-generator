// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore, oublierReglagesTouches } from '../../src/store/appStore.ts'
import {
  buildBackup,
  compresserBackup,
  serialiserBackup,
} from '../../src/core/backup.ts'
import type { Itinerary, Track } from '../../src/core/types.ts'

/**
 * Une restauration ne fait rien disparaître de ce qui arrive pendant qu'elle
 * tourne (soupçon noté en fermant #543, reproduit ici avant d'être corrigé).
 *
 * `importerSauvegarde` lisait l'état, écrivait en base — plusieurs `await` —
 * puis posait le résultat de sa fusion **à la place** de la liste en
 * mémoire. Ce qu'un import ou un tracé avait déposé entre la lecture et la
 * pose disparaissait de l'écran, et revenait au rechargement suivant :
 * présent en base, absent de la liste.
 */

const etatInitial = { ...useAppStore.getState() }

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ligne = (n: number): [number, number][] => [
  [4.6 + n * 1e-4, 45.4],
  [4.6 + n * 1e-4 + 1e-4, 45.4],
]

function geojson(nom: string, depart: number): File {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: nom },
        geometry: { type: 'LineString', coordinates: ligne(depart) },
      },
    ],
  }
  return new File([JSON.stringify(geo)], `${nom}.geojson`, {
    type: 'application/geo+json',
  })
}

const SORTIE: Track = {
  id: 'sortie-sauvegardee',
  filename: 'sortie.gpx',
  points: [
    [4.7, 45.5],
    [4.701, 45.5],
  ],
  date: null,
  importedAt: '2026-08-01T00:00:00.000Z',
}

const BOUCLE: Itinerary = {
  osmRelationId: -1,
  ref: null,
  name: 'Boucle sauvegardée',
  network: 'PERSO',
  ways: [{ osmWayId: -1, coords: ligne(900) }],
  totalMeters: 10,
  fetchedAt: '2026-08-01T00:00:00.000Z',
}

async function sauvegarde(): Promise<File> {
  const backup = buildBackup({
    tracks: [SORTIE],
    customItineraries: [BOUCLE],
    settings: {},
    parcoursDeclares: [],
    exportedAt: '2026-08-01T00:00:00.000Z',
  })
  const octets = await compresserBackup(serialiserBackup(backup))
  return new File([octets as BlobPart], 'sauvegarde.json.gz')
}

describe('une restauration et un import lancés ensemble', () => {
  it.each([
    ['la restauration d’abord', true],
    ['l’import d’abord', false],
  ])('gardent les deux à l’écran — %s', async (_nom, restaurerDAbord) => {
    await useAppStore.getState().init()
    const fichier = await sauvegarde()
    const restaurer = () => useAppStore.getState().importerSauvegarde(fichier)
    const importer = () =>
      useAppStore.getState().importCustomGpx([geojson('Import du jour', 0)])
    await (restaurerDAbord
      ? Promise.all([restaurer(), importer()])
      : Promise.all([importer(), restaurer()]))

    const noms = useAppStore
      .getState()
      .customItineraries.map((i) => i.name)
      .sort()
    expect(
      noms,
      'l’un des deux avait disparu de la liste, alors qu’il était en base',
    ).toEqual(['Boucle sauvegardée', 'Import du jour'])
    expect(useAppStore.getState().tracks.map((t) => t.id)).toEqual([
      'sortie-sauvegardee',
    ])
    const enBase = await useAppStore.getState().db!.listCustomItineraries()
    expect(enBase.map((i) => i.name).sort()).toEqual(noms)
  })
})
