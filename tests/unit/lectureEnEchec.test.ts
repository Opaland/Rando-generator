// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Une base qui s'ouvre mais ne se lit pas ne fige pas les imports (#543).
 *
 * L'import attend que `init()` ait lu les itinéraires de la base avant de
 * distribuer un numéro. Si cette lecture lève, l'attente doit se libérer
 * quand même : sinon le premier dépôt de fichier reste suspendu à vie, sans
 * un message. C'était le seul chemin du correctif qu'aucun test ne gardait.
 */
vi.mock('../../src/db/database.ts', async (original) => {
  const vrai = await original<typeof import('../../src/db/database.ts')>()
  return {
    ...vrai,
    openSentiersDb: async (...args: Parameters<typeof vrai.openSentiersDb>) => {
      const db = await vrai.openSentiersDb(...args)
      return {
        ...db,
        listCustomItineraries: () =>
          Promise.reject(new Error('lecture impossible')),
      }
    },
  }
})

const { useAppStore, oublierReglagesTouches } = await import(
  '../../src/store/appStore.ts'
)
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

function geojson(): File {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Malgré tout' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [4.6, 45.4],
            [4.601, 45.4],
          ],
        },
      },
    ],
  }
  return new File([JSON.stringify(geo)], 'malgre.geojson', {
    type: 'application/geo+json',
  })
}

describe('quand la lecture de la base lève', () => {
  it('un import lancé pendant le démarrage aboutit quand même', async () => {
    const demarrage = useAppStore.getState().init().catch(() => 'init a levé')
    const depot = useAppStore.getState().importCustomGpx([geojson()])
    // Une course bornée : un import suspendu à vie ferait expirer le test
    // en silence au bout de cinq secondes, pas échouer en disant pourquoi.
    const verdict = await Promise.race([
      depot.then(() => 'abouti'),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('suspendu')
        }, 2_000)
      }),
    ])
    expect(verdict, 'l’import attendait une lecture qui ne viendrait jamais').toBe(
      'abouti',
    )
    expect(await demarrage).toBe('init a levé')
    expect(useAppStore.getState().customItineraries.map((i) => i.name)).toEqual([
      'Malgré tout',
    ])
  })
})

/*
  Les deux survivants de `src/store/identifiantsPerso.ts` à la vague du
  18/10, et pourquoi ils restent (§6bis) :

  - `if (lecture) await lecture` → `if (true)` : `await null` ajoute un tour
    de microtâche et rien d'autre. Équivalent.
  - le corps de `creerIdentifiantsPerso` vidé : la fonction rend `undefined`
    et `appStore.ts` lève dès son import, en déstructurant. Stryker compte un
    échec à la collecte comme un survivant — la suite entière tombe, ce que
    l'outil ne sait pas attribuer à un test.
*/
