import { describe, it, expect } from 'vitest'
import {
  cumulativeDistances,
  historyStats,
  monthLabel,
  monthlyBuckets,
  trackDistanceMeters,
} from '../../src/core/history.ts'
import type { LonLat, Track } from '../../src/core/types.ts'

const LAT = 45.4

/** Trace rectiligne d'environ `meters` mètres, à la date donnée. */
function track(
  id: string,
  date: string | null,
  meters: number,
  elevationGain: number | null = null,
): Track {
  const points: LonLat[] = []
  const step = 0.0002
  const total = Math.max(2, Math.round(meters / (step * 111_195 * 0.7)))
  for (let i = 0; i < total; i++) points.push([4.5 + i * step, LAT])
  return {
    id,
    filename: `${id}.gpx`,
    points,
    date,
    importedAt: '2026-08-19T00:00:00Z',
    elevationGain,
  }
}

describe('trackDistanceMeters', () => {
  it('mesure la longueur de la trace', () => {
    expect(trackDistanceMeters(track('a', null, 1000))).toBeGreaterThan(500)
  })

  it('retourne 0 pour une trace sans géométrie exploitable', () => {
    const vide: Track = {
      id: 'v',
      filename: 'v.gpx',
      points: [],
      date: null,
      importedAt: '2026-08-19T00:00:00Z',
    }
    expect(trackDistanceMeters(vide)).toBe(0)
  })
})

describe('historyStats', () => {
  it('totalise sorties, distance et dénivelé', () => {
    const stats = historyStats([
      track('a', '2026-06-10T08:00:00Z', 5000, 300),
      track('b', '2026-07-02T08:00:00Z', 8000, 500),
    ])
    expect(stats.count).toBe(2)
    expect(stats.distanceMeters).toBeGreaterThan(0)
    expect(stats.elevationGain).toBe(800)
    expect(stats.firstDate).toBe('2026-06-10T08:00:00Z')
    expect(stats.lastDate).toBe('2026-07-02T08:00:00Z')
  })

  it('compte les sorties sans date sans les perdre', () => {
    const stats = historyStats([
      track('a', '2026-06-10T08:00:00Z', 5000),
      track('b', null, 3000),
    ])
    expect(stats.count).toBe(2)
    expect(stats.undatedCount).toBe(1)
    expect(stats.firstDate).toBe('2026-06-10T08:00:00Z')
  })

  it('ignore un dénivelé absent plutôt que de le compter pour zéro à tort', () => {
    const stats = historyStats([track('a', null, 1000, null)])
    expect(stats.elevationGain).toBe(0)
  })

  it('gère une liste vide', () => {
    expect(historyStats([])).toEqual({
      count: 0,
      distanceMeters: 0,
      elevationGain: 0,
      undatedCount: 0,
      firstDate: null,
      lastDate: null,
    })
  })

  it('écarte une date illisible comme une absence de date', () => {
    const stats = historyStats([track('a', 'pas-une-date', 1000)])
    expect(stats.undatedCount).toBe(1)
    expect(stats.firstDate).toBeNull()
  })
})

describe('monthlyBuckets', () => {
  it('regroupe les sorties par mois, du plus ancien au plus récent', () => {
    const buckets = monthlyBuckets([
      track('b', '2026-07-02T08:00:00Z', 8000, 500),
      track('a', '2026-06-10T08:00:00Z', 5000, 300),
      track('c', '2026-07-20T08:00:00Z', 2000, 100),
    ])
    expect(buckets.map((b) => b.month)).toEqual(['2026-06', '2026-07'])
    expect(buckets[1]!.count).toBe(2)
    expect(buckets[1]!.elevationGain).toBe(600)
  })

  it('comble les mois sans sortie plutôt que de les masquer', () => {
    // Un trou dans la pratique est une information, pas un détail à cacher.
    const buckets = monthlyBuckets([
      track('a', '2026-01-10T08:00:00Z', 5000),
      track('b', '2026-04-10T08:00:00Z', 5000),
    ])
    expect(buckets.map((b) => b.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    expect(buckets[1]!.count).toBe(0)
    expect(buckets[1]!.distanceMeters).toBe(0)
  })

  it('franchit correctement un changement d’année', () => {
    const buckets = monthlyBuckets([
      track('a', '2025-11-10T08:00:00Z', 1000),
      track('b', '2026-02-10T08:00:00Z', 1000),
    ])
    expect(buckets.map((b) => b.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('utilise le fuseau UTC, pour que le mois ne dépende pas du lieu de lecture', () => {
    // 23 h 30 le 31 janvier en UTC reste janvier, où qu'on ouvre l'app.
    const buckets = monthlyBuckets([track('a', '2026-01-31T23:30:00Z', 1000)])
    expect(buckets[0]!.month).toBe('2026-01')
  })

  it('retourne une liste vide sans sortie datée', () => {
    expect(monthlyBuckets([])).toEqual([])
    expect(monthlyBuckets([track('a', null, 1000)])).toEqual([])
  })
})

describe('cumulativeDistances', () => {
  it('accumule les distances mois après mois', () => {
    const buckets = monthlyBuckets([
      track('a', '2026-01-10T08:00:00Z', 5000),
      track('b', '2026-02-10T08:00:00Z', 5000),
    ])
    const cumul = cumulativeDistances(buckets)
    expect(cumul).toHaveLength(2)
    expect(cumul[1]).toBeCloseTo(
      buckets[0]!.distanceMeters + buckets[1]!.distanceMeters,
      5,
    )
  })

  it('gère une liste vide', () => {
    expect(cumulativeDistances([])).toEqual([])
  })
})

describe('monthLabel', () => {
  it('affiche un mois lisible en français', () => {
    const label = monthLabel('2026-08')
    expect(label).toMatch(/2026/)
    expect(label.toLowerCase()).toMatch(/ao/)
  })

  it('retourne la valeur brute si elle est inattendue', () => {
    expect(monthLabel('n’importe quoi')).toBe('n’importe quoi')
  })
})
