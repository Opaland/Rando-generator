import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'

/**
 * Issue #563 — appareil plein : une réponse réseau valide était perdue.
 *
 * `cache.put` lève `QuotaExceededError` quand le stockage est plein. Dans
 * `reseauPuisCache`, il était dans le `try` du réseau, et le `catch` ne
 * savait que se rabattre sur le cache ; dans `cachePuisReseau`, il n'avait
 * aucune garde. Le réseau avait répondu, et la page ne s'ouvrait pas — ou
 * la tuile IGN restait grise.
 *
 * Le vrai `public/sw.js` est évalué avec ses globales remplacées, comme
 * dans `swPrecharger.test.ts`.
 */

interface Strategies {
  reseauPuisCache: (
    request: unknown,
    cacheName: string,
    secours?: string,
  ) => Promise<unknown>
  cachePuisReseau: (request: unknown, cacheName: string) => Promise<unknown>
}

function chargerServiceWorker(putAccepte: boolean): Strategies {
  const cache = {
    put: () =>
      putAccepte
        ? Promise.resolve()
        : Promise.reject(new DOMException('plein', 'QuotaExceededError')),
    match: () => Promise.resolve(undefined),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  }
  const caches = {
    open: () => Promise.resolve(cache),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  }
  const reponse = {
    ok: true,
    type: 'basic',
    servie: true,
    clone: () => ({ ok: true }),
  }
  const self = {
    __PRECACHE__: [] as string[],
    location: { origin: 'https://exemple.test' },
    addEventListener: () => undefined,
    skipWaiting: () => Promise.resolve(),
    clients: {
      matchAll: () => Promise.resolve([]),
      claim: () => Promise.resolve(),
    },
  }
  // Même dérogation, et même raison, que dans `swPrecharger.test.ts` : la
  // chaîne évaluée est le fichier du dépôt, lu par le bundler.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fabrique = new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    `${swSource}\nreturn { reseauPuisCache, cachePuisReseau }`,
  ) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    Request: unknown,
  ) => Strategies
  // `Request` n'est construit que par `precharger`, qu'on n'appelle pas ici.
  return fabrique(self, caches, () => Promise.resolve(reponse), undefined)
}

const requete = { url: 'https://exemple.test/index.html', method: 'GET' }
const tuile = {
  url: 'https://data.geopf.fr/wmts?TILEMATRIX=12',
  method: 'GET',
}

describe('quand le cache refuse d’écrire, la réponse du réseau est servie', () => {
  it('une page (réseau d’abord)', async () => {
    const sw = chargerServiceWorker(false)
    await expect(sw.reseauPuisCache(requete, 'app')).resolves.toMatchObject({
      servie: true,
    })
  })

  it('une tuile (cache d’abord)', async () => {
    const sw = chargerServiceWorker(false)
    await expect(sw.cachePuisReseau(tuile, 'tuiles')).resolves.toMatchObject({
      servie: true,
    })
  })

  it('contrôle : un cache qui accepte sert la même réponse', async () => {
    const sw = chargerServiceWorker(true)
    await expect(sw.reseauPuisCache(requete, 'app')).resolves.toMatchObject({
      servie: true,
    })
    await expect(sw.cachePuisReseau(tuile, 'tuiles')).resolves.toMatchObject({
      servie: true,
    })
  })
})
