// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Trouvé par la vague de mutation du 17/10 sur appStore.ts :
 * `sortirDeLaDemonstration`, qui ferme la démonstration avant toute
 * opération réelle, n'est exercée dans les tests existants qu'à travers
 * des doublures (`sortirDeLaDemonstration: () => Promise.resolve()`) sur
 * les tranches qui la demandent — jamais à travers le vrai rappel que
 * `appStore.ts` fournit, qui regarde `get().demonstration` avant d'appeler
 * la vraie `arreterDemonstration`.
 *
 * Démarrer une sortie est l'un des appelants de cette garde
 * (`quitterDemonstration` posé sur `creerTrancheSortie`) : la démonstration
 * s'efface au premier geste réel, pour ne pas mélanger de vraies minutes
 * marchées à des sorties fictives.
 */

const etatInitial = { ...useAppStore.getState() }

function boucleFeature(gid: number, decalage: number) {
  return {
    type: 'Feature',
    properties: { gid, nom: `Boucle ${String(gid)}`, commune_depart: 'Lyon' },
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        Array.from({ length: 30 }, (_, i) => [4.8 + i * 0.001, 45.7 + decalage]),
      ],
    },
  }
}

function boucleLocale() {
  return {
    type: 'FeatureCollection',
    features: [1, 2, 3].map((gid) => boucleFeature(gid, gid * 0.02)),
  }
}

type FetchMocke = (url: string) => Promise<Response>
let fetchMock: Mock<FetchMocke>

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  fetchMock = vi.fn<FetchMocke>((url) =>
    url.includes('boucles-metropole-lyon')
      ? Promise.resolve(new Response(JSON.stringify(boucleLocale()), { status: 200 }))
      : Promise.resolve(new Response('', { status: 404 })),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: () => 42,
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

describe('démarrer une sortie quitte la démonstration', () => {
  it('éteint la démonstration en cours quand on démarre une sortie', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    expect(useAppStore.getState().demonstration).toBe(true)

    useAppStore.getState().demarrerSortie()
    // `quitterDemonstration` lance `sortirDeLaDemonstration` sans l'attendre
    // (`void`) : il faut laisser le fil microtâche s'écouler.
    await Promise.resolve()
    await Promise.resolve()

    expect(useAppStore.getState().demonstration).toBe(false)
  })
})

/**
 * Issue #600 — l'écran de la démonstration promet « Rien n'est enregistré »,
 * mais déclarer un parcours écrivait en base sans passer par la garde : la
 * déclaration survivait à la démonstration, et `quitterDemonstration` la
 * relisait comme une donnée réelle.
 *
 * Déclarer est un geste réel, sur une boucle réelle : comme démarrer une
 * sortie ou importer, il fait sortir de la démonstration avant d'écrire.
 */
describe('déclarer ou tracer quitte la démonstration', () => {
  async function enDemonstration(): Promise<number> {
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    expect(useAppStore.getState().demonstration).toBe(true)
    const boucle = useAppStore.getState().itineraries[0]
    expect(boucle).toBeDefined()
    return boucle!.osmRelationId
  }

  it('éteint la démonstration avant d’écrire la déclaration', async () => {
    const id = await enDemonstration()

    await useAppStore.getState().declarerParcours(id, null)

    expect(useAppStore.getState().demonstration).toBe(false)
    // Les sorties fictives sont parties : ce qui reste est réel.
    expect(useAppStore.getState().tracks).toEqual([])
    expect(useAppStore.getState().parcoursDeclares.map((d) => d.itineraryId)).toEqual([id])
  })

  it('éteint la démonstration avant de retirer une déclaration', async () => {
    const id = await enDemonstration()

    await useAppStore.getState().retirerParcoursDeclare(id)

    expect(useAppStore.getState().demonstration).toBe(false)
  })

  // Trouvé par la relecture adverse du correctif : le tracé à la main est le
  // même défaut par un autre chemin, et `quitterDemonstration` le relisait.
  it('éteint la démonstration avant d’enregistrer un tracé à la main', async () => {
    await enDemonstration()
    useAppStore.setState({
      drawPath: [
        [4.8, 45.7],
        [4.81, 45.71],
      ],
    })

    await useAppStore.getState().saveDrawnItinerary('Mon tracé')

    expect(useAppStore.getState().demonstration).toBe(false)
    expect(useAppStore.getState().customItineraries.map((i) => i.name)).toEqual([
      'Mon tracé',
    ])
  })
})
