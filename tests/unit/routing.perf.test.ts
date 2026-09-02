import { describe, it, expect } from 'vitest'
import {
  buildRoutingGraph,
  findPath,
  snapToNetwork,
} from '../../src/core/routing.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * Le budget du routage, sorti de `routing.test.ts` (issue #475).
 *
 * Il y vivait sous un nom ordinaire, et l'exclusion des chronomètres de
 * `vitest.mutation.config.ts` tient à un motif de nom de fichier : la vague
 * de mutation complète ne démarrait plus. Mesuré : 881 ms pour tout
 * `routing.test.ts` au repos, **2 506 ms pour ce seul test** avec les 99
 * fichiers du périmètre instrumentés — et à un seul processus, donc sans
 * concurrence. C'est l'instrumentation qui coûte, pas la charge.
 *
 * Le test lui-même n'a pas changé : mêmes données, même budget. Seul son
 * nom de fichier a bougé, pour que la règle qui l'écarte de la vague le
 * trouve. `npm run listes` garde maintenant cet accord.
 */
function itinerary(id: number, ways: LonLat[][]): Itinerary {
  return {
    osmRelationId: id,
    ref: `T${id}`,
    name: null,
    network: 'GR',
    ways: ways.map((coords, i) => ({ osmWayId: id * 100 + i, coords })),
    totalMeters: ways.reduce((sum, c) => sum + polylineLengthMeters(c), 0),
    fetchedAt: '2026-08-19T12:00:00Z',
  }
}

describe('performance', () => {
  it('construit le graphe et route sur un réseau réaliste en moins de 2 s', () => {
    // ~500 ways de 100 points : ordre de grandeur d'une grosse zone chargée.
    const ways: LonLat[][] = []
    for (let w = 0; w < 500; w++) {
      const coords: LonLat[] = []
      for (let i = 0; i < 100; i++) {
        coords.push([4.5 + i * 0.0002, 45.4 + w * 0.0005])
      }
      ways.push(coords)
      // Une liaison verticale entre bandes voisines pour un réseau connexe.
      if (w > 0) {
        ways.push([
          [4.5, 45.4 + (w - 1) * 0.0005],
          [4.5, 45.4 + w * 0.0005],
        ])
      }
    }
    const started = performance.now()
    const graph = buildRoutingGraph([itinerary(1, ways)])
    const from = snapToNetwork(graph, [4.5, 45.4])
    const to = snapToNetwork(graph, [4.5198, 45.4 + 499 * 0.0005])
    const path = findPath(graph, from as string, to as string)
    const elapsed = performance.now() - started
    expect(path).not.toBeNull()
    expect(elapsed).toBeLessThan(2000)
  })
})
