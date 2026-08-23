import { describe, it, expect } from 'vitest'
import { listerDeclarations } from '../../src/core/declaratif.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { ParcoursDeclare } from '../../src/core/declaratif.ts'

/**
 * Issue #158, troisième pierre — le déclaratif dans « Mes sorties ».
 *
 * Une **section à part**, et non des lignes glissées dans la liste des
 * traces. Cette liste-là est bâtie sur des `Track`, dont chaque entrée porte
 * une géométrie réelle, une longueur mesurée, un détail de sortie et une
 * suppression ; y mêler du déclaratif reviendrait à mélanger deux natures
 * dans le seul endroit où l'on compare ses sorties entre elles.
 *
 * C'est le même principe que les deux chiffres du tableau de bord : côte à
 * côte, jamais confondus.
 */

const GR = makeItinerary(1, [
  { osmWayId: 10, coords: straightLine(4.5, 45.4, 12_000, 100) },
], { ref: 'GR 7', name: 'Traversée du Pilat' })
const PR = makeItinerary(2, [
  { osmWayId: 20, coords: straightLine(4.7, 45.4, 4_000, 100) },
], { network: 'PR', ref: null, name: 'Boucle des Crêtes' })

function declare(id: number, date: string | null): ParcoursDeclare {
  return { itineraryId: id, date, declareLe: '2026-08-23T10:00:00.000Z' }
}

describe('listerDeclarations', () => {
  it('ne rend rien quand rien n’est déclaré', () => {
    expect(listerDeclarations([GR, PR], [])).toEqual([])
  })

  it('rend le nom, la longueur et la date de chaque déclaration', () => {
    const liste = listerDeclarations([GR, PR], [declare(2, '2024-05-01')])
    expect(liste).toHaveLength(1)
    expect(liste[0]?.nom).toBe('Boucle des Crêtes')
    expect(liste[0]?.metres).toBeCloseTo(PR.totalMeters, 0)
    expect(liste[0]?.date).toBe('2024-05-01')
  })

  /** Les plus récentes d'abord, comme la liste des traces. */
  it('trie de la plus récente à la plus ancienne', () => {
    const liste = listerDeclarations(
      [GR, PR],
      [declare(1, '2023-01-01'), declare(2, '2024-05-01')],
    )
    expect(liste.map((d) => d.itineraryId)).toEqual([2, 1])
  })

  /**
   * « Je ne sais plus quand » n'est pas une donnée manquante à reléguer par
   * accident : ces entrées vont en fin de liste, ce qui est un choix, et
   * elles y restent dans un ordre stable plutôt qu'au hasard.
   */
  it('range les sans-date à la fin, dans un ordre stable', () => {
    const liste = listerDeclarations(
      [GR, PR],
      [declare(1, null), declare(2, '2024-05-01')],
    )
    expect(liste.map((d) => d.itineraryId)).toEqual([2, 1])
  })

  it('ignore une déclaration dont l’itinéraire n’est pas chargé', () => {
    expect(listerDeclarations([GR], [declare(999, null)])).toEqual([])
  })

  /** Le réseau voyage avec : la liste doit pouvoir marquer un GR d'un PR. */
  it('garde le réseau', () => {
    const liste = listerDeclarations([GR, PR], [declare(1, null)])
    expect(liste[0]?.network).toBe('GR')
  })
})
