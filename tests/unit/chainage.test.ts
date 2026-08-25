import { describe, it, expect } from 'vitest'
import { chainWays } from '../../src/core/chainage.ts'
import type { LonLat, TrailWay } from '../../src/core/types.ts'

/**
 * Issue #303 — le chaînage, sorti de `stages.ts` pour être partagé.
 *
 * Ces tests viennent de la vague de mutation du 25/08 : `chainWays` sortait
 * à 84 %, et parmi ses survivants un seul changeait un résultat — celui qui
 * remplaçait `if (reste < 0) break` par `reste <= 0`.
 *
 * Ce n'est pas une subtilité d'index : `findIndex` rend **0** quand c'est le
 * premier tronçon de la liste qui reste à raccrocher, ce qui arrive dès que
 * la chaîne a commencé ailleurs. Avec `<= 0`, ce tronçon-là est perdu — et
 * avec lui ses kilomètres, silencieusement.
 */
const way = (id: number, coords: LonLat[]): TrailWay => ({
  osmWayId: id,
  coords,
})
const ligne = (depart: number, n = 3): LonLat[] =>
  Array.from({ length: n }, (_, i) => [depart + i * 0.01, 45.4] as LonLat)

describe('chainWays', () => {
  it('ne perd aucun tronçon quand le reliquat est le premier de la liste', () => {
    /*
      Le cas est plus étroit qu'il n'y paraît, et ma première tentative ne
      l'atteignait pas : le mutant survivait encore.

      Pour que `findIndex` rende **0**, il faut que le premier way de la
      liste soit encore inutilisé quand la chaîne bute. Or le départ est
      choisi sur la première extrémité libre, dans l'ordre d'insertion —
      donc un way disjoint posé en tête devient le départ, et l'indice 0
      n'est jamais un reliquat.

      Il faut donc que le premier way n'ait **aucune extrémité libre** : une
      boucle fermée, dont le départ et l'arrivée sont le même nœud. Elle est
      sautée par la recherche d'extrémité libre, la chaîne démarre sur le
      morceau ouvert, et c'est elle qu'on retrouve en reliquat à l'indice 0.

      Avec `reste <= 0`, cette boucle est perdue — et avec elle ses
      kilomètres, silencieusement.
    */
    const boucle: LonLat[] = [
      [5.0, 45.4],
      [5.01, 45.4],
      [5.01, 45.41],
      [5.0, 45.4],
    ]
    const ways = [
      way(1, boucle), // aucune extrémité libre : jamais choisie au départ
      way(2, ligne(4.5)), // 4,50 → 4,52
      way(3, ligne(4.52)), // 4,52 → 4,54
    ]
    const chaine = chainWays(ways)
    expect(chaine).toHaveLength(3)
    expect(new Set(chaine.map((m) => m.wayId))).toEqual(new Set([1, 2, 3]))
  })

  it('signale chaque reprise par un nouveau morceau', () => {
    const chaine = chainWays([
      way(1, ligne(4.5)),
      way(2, ligne(4.52)),
      way(3, ligne(5.0)),
    ])
    expect(chaine.filter((m) => m.newPiece)).toHaveLength(2)
  })

  it('retourne un tronçon décrit à l’envers, sans le dupliquer', () => {
    const chaine = chainWays([
      way(1, ligne(4.5)),
      way(2, [...ligne(4.52)].reverse()),
    ])
    expect(chaine).toHaveLength(2)
    expect(chaine[1]!.reversed).toBe(true)
    // La marche continue là où le premier s'arrête.
    expect(chaine[1]!.start).toEqual(chaine[0]!.end)
  })

  it('écarte un tronçon d’un seul point, qui n’a pas de sens de marche', () => {
    const chaine = chainWays([way(1, ligne(4.5)), way(2, [[4.52, 45.4]])])
    expect(chaine.map((m) => m.wayId)).toEqual([1])
  })
})
