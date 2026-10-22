// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Trouvé par la vague de mutation du 17/10 sur appStore.ts : les ports
 * `poser`, `rangerTrace` et `base` que `appStore.ts` fournit à
 * `creerTrancheSortie` n'étaient exercés par aucun test — ni directement
 * (`tests/unit/enregistrementSlice.test.ts` leur substitue des doublures
 * fidèles mais maison), ni à travers le vrai store. Une sortie qui se
 * termine doit vraiment finir dans `tracks`, et vraiment se persister dans
 * la base ouverte par `init()`.
 */

const etatInitial = { ...useAppStore.getState() }

function position(lon: number, lat: number): GeolocationPosition {
  return {
    coords: { longitude: lon, latitude: lat, accuracy: 10, altitude: null },
    timestamp: Date.now(),
  } as GeolocationPosition
}

let surPosition: ((position: GeolocationPosition) => void) | null = null

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))))
  surPosition = null
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (ok: (position: GeolocationPosition) => void) => {
        surPosition = ok
        return 42
      },
      clearWatch: () => undefined,
    },
  })
})

afterEach(async () => {
  if (useAppStore.getState().enregistrement.etat !== 'repos') {
    await useAppStore.getState().abandonnerSortie()
  }
  vi.unstubAllGlobals()
})

describe('les écritures de reprise passent vraiment par la base', () => {
  it('écrit l’en-tête de la sortie démarrée dans la base ouverte', async () => {
    // Trouvé par mutation du 17/10 : le port `base: () => get().db` est
    // séparé de l'accès direct à `get().db` dans `rangerTrace` — il ne
    // sert qu'aux écritures de reprise (`ecrireEntete`,
    // `ecrirePointsEnAttente`, `viderLeTampon`). Aucun test ne vérifiait
    // qu'il rend vraiment la base, plutôt que rien.
    await useAppStore.getState().init()
    useAppStore.getState().demarrerSortie()
    // `ecrireEntete` est lancé sans l'attendre (`void`), derrière une file
    // d'écriture (`enfiler`) qui passe par une vraie transaction
    // IndexedDB : une poignée de microtâches ne suffit pas à la laisser
    // finir, il faut un vrai tour de boucle d'événements.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const db = useAppStore.getState().db
    const tete = await db?.lireEntete()
    expect(tete).not.toBeUndefined()
  })
})

describe('terminer une sortie la range vraiment, et la persiste', () => {
  it('ajoute la trace à `tracks` et l’écrit dans la base ouverte', async () => {
    await useAppStore.getState().init()
    useAppStore.getState().demarrerSortie()
    surPosition?.(position(4.8, 45.75))
    surPosition?.(position(4.81, 45.76))

    await useAppStore.getState().terminerSortie()

    const tracks = useAppStore.getState().tracks
    expect(tracks).toHaveLength(1)

    const db = useAppStore.getState().db
    const enBase = await db?.listTracks()
    expect(enBase?.map((t) => t.id)).toEqual(tracks.map((t) => t.id))
  })
})
