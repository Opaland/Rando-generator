import { describe, it, expect } from 'vitest'
import { listerDeclarations, type ParcoursDeclare } from '../../src/core/declaratif.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

/**
 * L'ordre de la section « Parcours déclarés » (#158), que la vague de
 * mutation du 19/10 a trouvé sans test : `listerDeclarations` n'en avait
 * aucun.
 *
 * Retirer la garde des dates égales ne laissait rien rougir. Deux
 * déclarations du même jour passaient alors par `return -1`, et le tri de
 * V8 inverse leur ordre d'arrivée — la liste changeait d'ordre à chaque
 * ajout, sans que personne ne le voie.
 */
const itineraires = [1, 2, 3, 4].map((id) =>
  makeItinerary(id, [{ osmWayId: id * 10, coords: straightLine(4.5, 45.4, 1_000, 100) }]),
)

function declare(id: number, date: string | null): ParcoursDeclare {
  return { itineraryId: id, date, declareLe: '2026-08-23T10:00:00.000Z' }
}

const ids = (declares: ParcoursDeclare[]) =>
  listerDeclarations(itineraires, declares).map((d) => d.itineraryId)

describe('listerDeclarations', () => {
  it('met la plus récente en tête, et les sans-date à la fin', () => {
    expect(
      ids([declare(1, null), declare(2, '2026-05-01'), declare(3, '2026-07-01'), declare(4, null)]),
    ).toEqual([3, 2, 1, 4])
  })

  it('garde l’ordre d’arrivée entre deux déclarations du même jour', () => {
    expect(ids([declare(1, '2026-06-01'), declare(2, '2026-06-01'), declare(3, '2026-07-01')])).toEqual([3, 1, 2])
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `b.date === null` retiré : `a.date < null` est faux, la comparaison rend
    −1, le même rang que la garde ;
  - `<` en `<=` : l'égalité est traitée deux lignes plus haut.
*/
