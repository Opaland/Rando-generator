// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Trouvé par la vague de mutation du 17/10 sur appStore.ts : `fusionner`,
 * qui réunit ce qu'`init` relit en base avec ce qui est déjà en mémoire,
 * n'était mis à l'épreuve d'aucun cas où les deux ensembles se recoupent
 * **partiellement**. Les tests existants de `init` ne font jamais
 * cohabiter une trace déjà connue des deux côtés avec une trace qui ne
 * l'est que d'un seul : soit la base est vide, soit les deux côtés sont
 * identiques — un cas où « ne garder que les nouvelles » et « tout
 * garder » rendent le même résultat.
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

type FetchMocke = (url: string) => Promise<Response>
let fetchMock: Mock<FetchMocke>

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  fetchMock = vi.fn<FetchMocke>(() =>
    Promise.resolve(new Response('', { status: 404 })),
  )
  vi.stubGlobal('fetch', fetchMock)
})

describe('fusionner (init, traces)', () => {
  it('garde une trace déjà en base sans la dupliquer, et garde aussi celle qui n’est qu’en mémoire', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('deja-en-base.gpx', 0)])

    // Un quota dépassé laisse la seconde trace en mémoire seule : la base
    // ne l'a jamais reçue (le commentaire de `rangerTrace` le dit).
    const db = useAppStore.getState().db
    if (!db) throw new Error('base absente dans ce test')
    vi.spyOn(db, 'saveTrack').mockRejectedValueOnce(new Error('quota'))
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('memoire-seule.gpx', 1)])

    // Un second `init()` relit la base : elle n'y retrouve que la
    // première trace. Sans un vrai dédoublonnage, soit la première se
    // duplique, soit la seconde — qui n'est qu'en mémoire — se perd.
    await useAppStore.getState().init()

    const noms = useAppStore.getState().tracks.map((t) => t.filename).sort()
    expect(noms).toEqual(['deja-en-base.gpx', 'memoire-seule.gpx'])
  })
})
