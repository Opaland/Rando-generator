import { afterEach, describe, it, expect, vi } from 'vitest'
import { conteneurServiceWorker } from '../../src/lib/serviceWorker.ts'

/**
 * La garde nommée de l'issue #561. Le cas qui compte est l'absence : c'est
 * celui d'une origine non sécurisée, et celui qui laissait la page blanche.
 * Le rendu lui-même est éprouvé par `tests/e2e/origine-non-securisee.spec.ts`.
 */
describe('conteneurServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rend undefined quand le navigateur n’a pas de service worker', () => {
    vi.stubGlobal('navigator', {})
    expect(conteneurServiceWorker()).toBeUndefined()
  })

  it('rend le conteneur quand il existe', () => {
    const conteneur = { controller: null }
    vi.stubGlobal('navigator', { serviceWorker: conteneur })
    expect(conteneurServiceWorker()).toBe(conteneur)
  })
})
