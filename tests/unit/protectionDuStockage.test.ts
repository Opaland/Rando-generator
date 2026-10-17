// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Trouvé par la vague de mutation du 17/10 sur appStore.ts :
 * `protegerLeStockage`, qui ne doit demander `navigator.storage.persist()`
 * **qu'une seule fois par session**, n'était exercé qu'à travers une
 * doublure dans `tests/unit/importSansRien.test.ts` — qui compte ses
 * appels mais ne verrouille jamais rien, puisqu'elle n'est pas la vraie
 * fonction. Le drapeau `persistanceDemandee` lui-même n'était donc jamais
 * mis à l'épreuve d'un second import.
 */

const etatInitial = { ...useAppStore.getState() }

function fichierGpx(nom: string, decalage: number): File {
  const trkpts = Array.from(
    { length: 5 },
    (_, i) =>
      `<trkpt lat="${String(45.4 + decalage)}" lon="${String(4.5 + i * 0.001)}"></trkpt>`,
  ).join('')
  const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  return new File([xml], nom, { type: 'application/gpx+xml' })
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('protegerLeStockage', () => {
  it('ne demande la persistance qu’une seule fois, même après un second import', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    vi.stubGlobal('navigator', {
      storage: {
        persisted: () => Promise.resolve(false),
        persist,
        estimate: () => Promise.resolve({}),
      },
    })

    await useAppStore.getState().init()
    await useAppStore.getState().importGpxFiles([fichierGpx('a.gpx', 0)])
    expect(persist).toHaveBeenCalledTimes(1)

    await useAppStore.getState().importGpxFiles([fichierGpx('b.gpx', 1)])
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
