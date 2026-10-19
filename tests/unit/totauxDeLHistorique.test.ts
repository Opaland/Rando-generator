import { describe, it, expect } from 'vitest'
import { historyStats, monthLabel, monthlyBuckets } from '../../src/core/history.ts'
import type { Track } from '../../src/core/types.ts'

/**
 * Les totaux et les mois de l'historique, là où la vague de mutation du 19/10
 * les a trouvés sans test.
 *
 * Le dénivelé absent était éprouvé avec `null` — qui s'additionne comme zéro,
 * de sorte que la garde pouvait disparaître sans qu'un test le voie. Une
 * trace écrite par une version antérieure n'a pas la propriété du tout, et
 * `undefined` donne `NaN`, qui gagne tout le total.
 */
function trace(id: string, date: string | null, elevationGain?: number): Track {
  const base = {
    id,
    filename: `${id}.gpx`,
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ] as Track['points'],
    date,
    importedAt: '2026-08-19T00:00:00Z',
  }
  return elevationGain === undefined ? base : { ...base, elevationGain }
}

describe('une trace sans propriété de dénivelé', () => {
  const traces = [trace('ancienne', '2026-06-01T08:00:00Z'), trace('mesuree', '2026-06-02T08:00:00Z', 400)]

  it('ne rend pas le total général illisible', () => {
    expect(historyStats(traces).elevationGain).toBe(400)
  })

  it('ne rend pas le total du mois illisible', () => {
    expect(monthlyBuckets(traces).map((m) => m.elevationGain)).toEqual([400])
  })
})

describe('monthlyBuckets', () => {
  it('ne fait pas de mois avec une date illisible', () => {
    expect(
      monthlyBuckets([trace('a', 'pas-une-date'), trace('b', '2026-06-01T08:00:00Z')]).map((m) => m.month),
    ).toEqual(['2026-06'])
  })
})

describe('monthLabel', () => {
  it('rend la valeur brute d’un mois qui n’existe pas, sans lever', () => {
    // La forme passe le motif, la date non : `Intl` lèverait sur une date
    // invalide.
    expect(monthLabel('2026-13')).toBe('2026-13')
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - les ancres du motif `^\d{4}-\d{2}$`, et le motif lui-même retiré :
    `new Date` refuse tout ce qu'elles laisseraient passer (« x2026-08 »,
    « 2026-08x », « 12026-08 », vérifiés), et la garde suivante rend la
    valeur brute ;
  - `<` et `>` en `<=` et `>=` sur la première et la dernière date : deux
    sorties au même instant, l'une ou l'autre écriture de cet instant ;
  - les options de `Intl.DateTimeFormat` vidées : elles **lèvent** au
    chargement du module, aucun test ne tourne, et Stryker compte pourtant le
    mutant comme survivant. Ce sont des tués.
*/
