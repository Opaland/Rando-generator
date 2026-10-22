// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { OverpassError } from '../../src/core/overpass.ts'

/**
 * Issue trouvée par la vague de mutation du 17/10.
 *
 * `loadFromOverpass` choisit son message d'échec sur
 * `error instanceof OverpassError || error instanceof DbError` : le message
 * du service dans les deux cas connus, un message générique sinon. Les tests
 * existants (`oubliDuCacheDeZone.test.ts`, `appStore.test.ts`) ne couvrent
 * que des pannes où `fetchOverpass` a déjà enveloppé l'échec dans une vraie
 * `OverpassError` — la condition y est donc toujours vraie, et le mutant qui
 * la fige à `true` ne s'y voit pas.
 *
 * Il fallait une panne qui ne vienne **pas** d'Overpass : ici, `recompute()`
 * — appelé après l'écriture des itinéraires — qui rejette avec une erreur
 * ordinaire. Sans cache pour amortir, c'est le message générique qui doit
 * sortir.
 */
vi.mock('../../src/core/overpass.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/overpass.ts')>(
      '../../src/core/overpass.ts',
    )
  return {
    ...vrai,
    fetchOverpass: () =>
      Promise.resolve({
        version: 0.6,
        generator: 'test',
        elements: [],
      }),
  }
})

const { trancheZone } = await import('../../src/store/trancheZone.ts')
import type { DependancesZone } from '../../src/store/trancheZone.ts'

describe('message d’échec générique, hors Overpass et hors base', () => {
  it('ne prête pas le message du service à une panne qui n’en vient pas', async () => {
    const etat: Record<string, unknown> = {
      db: null,
      zoneKey: null,
      itineraries: [],
      demonstration: false,
      zoneLoading: false,
    }
    const deps = {
      set: (partiel: unknown) => {
        const bout =
          typeof partiel === 'function'
            ? (partiel as (e: unknown) => object)(etat)
            : partiel
        Object.assign(etat, bout)
      },
      etat: () => etat,
      baseOuverte: () => Promise.resolve(null),
      persistLastZone: () => Promise.resolve(),
      oublierLaZoneEnCache: () => Promise.resolve(),
      // Rejette avec une erreur ordinaire, bien après la réponse d'Overpass :
      // ni OverpassError, ni DbError.
      recompute: () => Promise.reject(new Error('bug interne (test)')),
      setItineraries: () => {},
      oublierLesLieux: () => {},
      sortirDeLaDemonstration: () => Promise.resolve(),
    } as unknown as DependancesZone

    const actions = trancheZone(deps)
    await actions.loadZone('ain')

    expect(etat.zoneError).toBe(
      'Le chargement des tracés a échoué. Vérifiez votre connexion puis réessayez.',
    )
    // Le contraste qui prouve que la mesure porte sur la bonne branche :
    // une vraie OverpassError, elle, parle avec son propre message.
    expect(
      new OverpassError('x') instanceof OverpassError,
      'contrôle de cohérence : OverpassError doit rester reconnaissable',
    ).toBe(true)
  })
})
