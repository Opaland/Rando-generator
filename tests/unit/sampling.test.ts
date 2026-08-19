import { describe, it, expect } from 'vitest'
import {
  polylineLengthMeters,
  sampleWay,
} from '../../src/core/sampling.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { straightLine } from '../fixtures/synthetic.ts'
import type { LonLat } from '../../src/core/types.ts'

const LAT = 45

describe('polylineLengthMeters', () => {
  it('vaut 0 pour une polyligne vide ou à un seul point', () => {
    expect(polylineLengthMeters([])).toBe(0)
    expect(polylineLengthMeters([[4.5, LAT]])).toBe(0)
  })

  it('mesure une ligne droite de 1 000 m à ~1 m près', () => {
    const line = straightLine(4.5, LAT, 1000, 250)
    expect(polylineLengthMeters(line)).toBeCloseTo(1000, 0)
  })
})

describe('sampleWay', () => {
  it('retourne [] pour un way de moins de 2 points', () => {
    expect(sampleWay([], 100)).toEqual([])
    expect(sampleWay([[4.5, LAT]], 100)).toEqual([])
  })

  it('échantillonne une ligne de 1 000 m en 11 points (0 à 1 000 m)', () => {
    const line = straightLine(4.5, LAT, 1000, 250)
    const samples = sampleWay(line, 100)
    expect(samples).toHaveLength(11)
    // Le premier échantillon est le départ du way.
    expect(samples[0]).toEqual(line[0])
    // Chaque échantillon est à k × 100 m du départ.
    samples.forEach((s, k) => {
      expect(distanceMeters(line[0]!, s)).toBeCloseTo(k * 100, 0)
    })
  })

  it('reporte le reliquat entre segments sans dérive cumulative', () => {
    // 30 segments de 33 m = 990 m : 100 n'est multiple d'aucune longueur de segment.
    const line = straightLine(4.5, LAT, 990, 33)
    const samples = sampleWay(line, 100)
    expect(samples).toHaveLength(10) // 0, 100, …, 900
    for (let i = 1; i < samples.length; i++) {
      const d = distanceMeters(samples[i - 1]!, samples[i]!)
      expect(Math.abs(d - 100)).toBeLessThan(0.5)
    }
    // Pas de dérive : le dernier échantillon est bien à 900 m du départ.
    expect(distanceMeters(line[0]!, samples[9]!)).toBeCloseTo(900, 0)
  })

  it('un way plus court que STEP donne un seul échantillon (le départ)', () => {
    const line = straightLine(4.5, LAT, 40, 40)
    const samples = sampleWay(line, 100)
    expect(samples).toHaveLength(1)
    expect(samples[0]).toEqual(line[0])
  })

  it('les échantillons restent sur la polyligne', () => {
    // Ligne horizontale : tous les échantillons doivent garder la même latitude.
    const line = straightLine(4.5, LAT, 500, 70)
    for (const s of sampleWay(line, 100)) {
      expect(s[1]).toBeCloseTo(LAT, 10)
    }
  })

  it('gère les points consécutifs identiques (segments de longueur nulle)', () => {
    const a: LonLat = [4.5, LAT]
    const line = straightLine(4.5, LAT, 300, 100)
    const withDup: LonLat[] = [a, a, ...line.slice(1)]
    expect(sampleWay(withDup, 100)).toHaveLength(4)
  })
})
