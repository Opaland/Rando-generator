// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useAppStore,
  oublierReglagesTouches,
} from '../../src/store/appStore.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Trouvé par une vague de mutation du 17/10, sur la portion de
 * `appStore.ts` qui recalcule le matching, restaure la zone et ouvre la
 * base — `recompute`, `setItineraries`, `baseOuverte`/`init`, et l'état
 * initial du magasin. Rien n'y était faux ; plusieurs chemins n'étaient
 * simplement jamais lus par un test.
 */

const etatInitial = { ...useAppStore.getState() }

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Un GPX d'une trace nommée, de deux points — assez pour un itinéraire. */
function gpxPerso(nom: string): File {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="45.4000" lon="4.5000"></trkpt>
    <trkpt lat="45.4010" lon="4.5020"></trkpt>
  </trkseg></trk>
</gpx>`
  return new File([xml], `${nom}.gpx`, { type: 'application/gpx+xml' })
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.includes('interpreter')
          ? reponse(pilat)
          : new Response('', { status: 404 }),
      ),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('l’état initial du magasin', () => {
  /*
    Trouvé par mutation du 17/10 : ces valeurs par défaut, posées à la
    construction du magasin, n'étaient jamais relues directement — seules
    leurs retombées (une zone chargée, un calcul terminé) l'étaient.
  */
  it('part sans zone en chargement, sans POI, et sans calcul en cours', () => {
    const etat = useAppStore.getState()
    expect(etat.zoneLoading).toBe(false)
    expect(etat.poisZone).toEqual([])
    expect(etat.poisZoneLoading).toBe(false)
    expect(etat.poisZoneTronque).toBe(false)
    expect(etat.matchingBusy).toBe(false)
    expect(etat.zoneRestoredAtStartup).toBe(false)
  })
})

describe('recompute', () => {
  it('signale le calcul en cours pendant qu’il tourne, et le referme ensuite', async () => {
    // Trouvé par mutation du 17/10 : `matchingBusy` n'était jamais relu, ni
    // pendant le calcul, ni une fois celui-ci terminé.
    const vus: boolean[] = []
    const desabonner = useAppStore.subscribe((etat) => {
      vus.push(etat.matchingBusy)
    })
    try {
      await useAppStore.getState().setTolerance(60)
    } finally {
      desabonner()
    }
    expect(vus).toContain(true)
    expect(useAppStore.getState().matchingBusy).toBe(false)
  })

  it('calcule aussi le matching des itinéraires personnels, à part', async () => {
    // Trouvé par mutation du 17/10 : aucun test ne peuplait
    // `customItineraries` puis ne relisait `customMatching`.
    await useAppStore.getState().init()
    await useAppStore.getState().importCustomGpx([gpxPerso('solo')])
    expect(useAppStore.getState().customItineraries).toHaveLength(1)
    await useAppStore.getState().setTolerance(60)
    expect(useAppStore.getState().customMatching).not.toBeNull()
    expect(useAppStore.getState().customMatching?.results).toHaveLength(1)
  })

  it('ne calcule pas de matching perso sans itinéraire personnel', async () => {
    await useAppStore.getState().setTolerance(60)
    expect(useAppStore.getState().customMatching).toBeNull()
  })
})

describe('setItineraries (via loadZone)', () => {
  it('referme le chargement de zone une fois les itinéraires posés', async () => {
    // Trouvé par mutation du 17/10 : `zoneLoading` n'était jamais relu après
    // la fin d'un chargement, seulement pendant.
    await useAppStore.getState().loadZone('pilat')
    expect(useAppStore.getState().zoneLoading).toBe(false)
  })

  it('dit qu’un chargement explicite n’est plus la zone restaurée au démarrage', async () => {
    // Trouvé par mutation du 17/10 : jamais mis à `true` par un test avant
    // de vérifier que `loadZone` le remet à `false`.
    useAppStore.setState({ zoneRestoredAtStartup: true })
    await useAppStore.getState().loadZone('pilat')
    expect(useAppStore.getState().zoneRestoredAtStartup).toBe(false)
  })
})

describe('init — l’ouverture de la base échoue', () => {
  it('reprend le message de la DbError plutôt que d’en inventer un autre', async () => {
    /*
      Trouvé par mutation du 17/10 : le seul test existant sur `dbWarning`
      vérifie qu'il reste `null` au succès — jamais ce qu'il devient à
      l'échec. `openSentiersDb` enveloppe toujours son échec dans une
      `DbError` (vérifié en lisant `src/db/database.ts`), donc c'est la
      branche `error instanceof DbError ? error.message : ...` qui décide,
      et c'est elle qui n'était jamais atteinte.
    */
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('panne simulée, sans rapport avec IndexedDB')
      },
    })
    await useAppStore.getState().init()
    expect(useAppStore.getState().db).toBeNull()
    expect(useAppStore.getState().dbWarning).toMatch(
      /Impossible d’ouvrir le stockage local/,
    )
  })
})
