import { describe, it, expect, vi } from 'vitest'
import { emporterPois } from '../../src/lib/emporter.ts'
import type { PoisEmportes } from '../../src/core/poisEmportes.ts'
import type { PointOfInterest } from '../../src/core/types.ts'

/**
 * Mettre les points d'intérêt de côté (issue #153, quatrième pierre).
 *
 * Trois lignes de glu, et trois décisions qui ne se relisent pas dans un
 * composant : ce qu'on écrit quand Overpass ne répond pas, ce qu'on écrit
 * quand il répond « rien », et ce qui se passe quand la base refuse.
 */

const TRACE: [number, number][] = [
  [4.5, 45.4],
  [4.51, 45.41],
]

function poi(id: string): PointOfInterest {
  return {
    id,
    lon: 4.5,
    lat: 45.4,
    kind: 'water',
    name: null,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

const INSTANT = new Date('2026-08-23T10:00:00.000Z')

function ports(
  recuperes: PointOfInterest[] | null,
  ecrire = vi.fn<(p: PoisEmportes) => Promise<void>>(() => Promise.resolve()),
) {
  return {
    ecrire,
    ports: {
      recuperer: () => Promise.resolve(recuperes),
      ecrire,
      maintenant: () => INSTANT,
    },
  }
}

describe('emporterPois', () => {
  it('range ce qu’Overpass a donné, daté', async () => {
    const { ecrire, ports: p } = ports([poi('node/1'), poi('node/2')])
    await expect(emporterPois(p, 42, TRACE)).resolves.toBe(true)
    expect(ecrire).toHaveBeenCalledWith({
      itineraryId: 42,
      pois: [poi('node/1'), poi('node/2')],
      recuperesLe: INSTANT.toISOString(),
    })
  })

  /**
   * Overpass a répondu, il n'y a rien le long de ce sentier. C'est un fait,
   * et il vaut d'être emporté : sans quoi, hors connexion, la fiche
   * chercherait indéfiniment une réserve qui n'existe pas et laisserait
   * croire à une panne.
   */
  it('range aussi un vide, parce que c’est une réponse', async () => {
    const { ecrire, ports: p } = ports([])
    await expect(emporterPois(p, 42, TRACE)).resolves.toBe(true)
    expect(ecrire).toHaveBeenCalledWith({
      itineraryId: 42,
      pois: [],
      recuperesLe: INSTANT.toISOString(),
    })
  })

  /**
   * En revanche, un échec ne s'écrit pas. Ranger `[]` faute de réseau
   * effacerait une réserve constituée hier et la remplacerait par « il n'y
   * a rien ici » — un mensonge qui survivrait au retour du réseau.
   */
  it('n’écrit rien quand la demande n’a pas abouti', async () => {
    const { ecrire, ports: p } = ports(null)
    await expect(emporterPois(p, 42, TRACE)).resolves.toBe(false)
    expect(ecrire).not.toHaveBeenCalled()
  })

  /** Un POI est un bonus : son échec n'a pas à faire tomber le reste. */
  it('rend faux plutôt que de lever quand la base refuse', async () => {
    const ecrire = vi.fn(() => Promise.reject(new Error('quota')))
    const p = {
      recuperer: () => Promise.resolve([poi('node/1')]),
      ecrire,
      maintenant: () => INSTANT,
    }
    await expect(emporterPois(p, 42, TRACE)).resolves.toBe(false)
  })
})
