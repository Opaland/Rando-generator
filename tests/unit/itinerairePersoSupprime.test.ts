// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useAppStore,
  oublierReglagesTouches,
} from '../../src/store/appStore.ts'

/**
 * Issue #549 — un itinéraire perso supprimé laissait derrière lui sa
 * déclaration « parcouru », son épingle d'objectif et ses POI emportés.
 *
 * Le distributeur de numéros repart de ce qu'il voit à chaque session : au
 * rechargement suivant, le numéro du supprimé redevient libre, et le
 * prochain import en hérite. Mesuré par la revue du 19/10 : C s'ouvrait
 * « déclaré parcouru » et épinglé, sans que personne ait rien fait.
 *
 * Tout passe par `useAppStore` : le défaut vit dans le fil entre la
 * suppression (tranche d'import) et ce que possèdent les autres tranches.
 */

const etatInitial = { ...useAppStore.getState() }

function gpxPerso(nom: string, decalage = 0): File {
  const lat = (45.4 + decalage / 100).toFixed(4)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="${lat}" lon="4.5000"></trkpt>
    <trkpt lat="${lat}" lon="4.5020"></trkpt>
  </trkseg></trk>
</gpx>`
  return new File([xml], `${nom}.gpx`, { type: 'application/gpx+xml' })
}

/** Un rechargement : la mémoire repart de zéro, la base reste. */
async function recharger(): Promise<void> {
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
  await useAppStore.getState().init()
}

function idDe(nom: string): number {
  const it = useAppStore
    .getState()
    .customItineraries.find((i) => i.name === nom)
  expect(it, `${nom} devait être importé`).toBeDefined()
  return it?.osmRelationId ?? 0
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A et B importés, B déclaré parcouru, épinglé, et ses POI emportés. */
async function bMarqueDePartout(): Promise<number> {
  await useAppStore.getState().init()
  await useAppStore
    .getState()
    .importCustomGpx([gpxPerso('A'), gpxPerso('B', 1)])
  const b = idDe('B')
  await useAppStore.getState().declarerParcours(b, null)
  await useAppStore.getState().basculerObjectif(b)
  await useAppStore.getState().db?.ecrirePoisEmportes({
    itineraryId: b,
    pois: [],
    recuperesLe: '2026-10-19T10:00:00.000Z',
  })
  return b
}

describe('supprimer un itinéraire perso oublie ce qui le désignait', () => {
  it('retire sa déclaration, son objectif et ses POI, en mémoire et en base', async () => {
    const b = await bMarqueDePartout()

    await useAppStore.getState().removeCustomItinerary(b)

    const etat = useAppStore.getState()
    expect(etat.parcoursDeclares.map((d) => d.itineraryId)).not.toContain(b)
    expect(etat.objectifs).not.toContain(b)
    const db = etat.db
    expect(db).not.toBeNull()
    expect(
      (await db?.listerParcoursDeclares())?.map((d) => d.itineraryId),
    ).not.toContain(b)
    expect(String(await db?.getSetting('objectifs'))).not.toContain(String(b))
    expect(await db?.lirePoisEmportes(b)).toBeUndefined()
  })

  /*
    Le scénario de l'issue, de bout en bout. Il passe avec l'une ou l'autre
    moitié du correctif seule — le nettoyage, ou le distributeur qui saute
    les numéros désignés — et ne rougit que sans les deux : vérifié. Chaque
    moitié a son propre test, au-dessus et en dessous.
  */
  it('ne laisse pas le suivant en hériter après un rechargement', async () => {
    const b = await bMarqueDePartout()
    await useAppStore.getState().removeCustomItinerary(b)

    await recharger()
    await useAppStore.getState().importCustomGpx([gpxPerso('C', 2)])
    const c = idDe('C')

    const etat = useAppStore.getState()
    expect(etat.parcoursDeclares.map((d) => d.itineraryId)).not.toContain(c)
    expect(etat.objectifs).not.toContain(c)
  })
})

/*
  Les bases qui ont connu le défaut gardent leurs orphelins : une
  déclaration et un objectif sur un numéro que plus aucun itinéraire ne
  porte. Le nettoyage à la suppression ne les voit pas — il est arrivé
  après. C'est donc le distributeur qui doit ne pas redonner ces numéros.
*/
describe('un orphelin laissé par une version précédente', () => {
  it('n’est pas redonné à un nouvel itinéraire', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().importCustomGpx([gpxPerso('A')])
    const a = idDe('A')
    const orphelin = a - 1
    await useAppStore.getState().declarerParcours(orphelin, null)
    await useAppStore.getState().basculerObjectif(orphelin)

    await recharger()
    await useAppStore.getState().importCustomGpx([gpxPerso('C', 2)])

    expect(idDe('C')).not.toBe(orphelin)
  })
})
