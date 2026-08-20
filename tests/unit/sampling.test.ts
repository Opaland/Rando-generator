import { describe, it, expect } from 'vitest'
import {
  polylineLengthMeters,
  sampleWay,
  slicePolyline,
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

describe('slicePolyline', () => {
  // Un « L » : 100 m vers l'est, puis 100 m vers le nord. Le coin est le
  // point que tout raccourci fait disparaître.
  const L: LonLat[] = [
    [0, 0],
    [0.00089932, 0],
    [0.00089932, 0.00089932],
  ]

  it('rend la portion demandée, avec ses sommets intermédiaires', () => {
    // De 50 m à 150 m : la portion traverse le coin, qui doit être conservé.
    const portion = slicePolyline(L, 50, 150)
    expect(portion.length).toBeGreaterThanOrEqual(3)
    const coin = portion.find(
      ([lon, lat]) => Math.abs(lon - 0.00089932) < 1e-7 && Math.abs(lat) < 1e-7,
    )
    expect(coin).toBeDefined()
  })

  it('commence et finit aux distances demandées', () => {
    const portion = slicePolyline(L, 50, 150)
    expect(polylineLengthMeters(portion)).toBeCloseTo(100, 0)
  })

  it('rend la polyligne entière quand on demande tout', () => {
    const portion = slicePolyline(L, 0, 1_000)
    expect(polylineLengthMeters(portion)).toBeCloseTo(
      polylineLengthMeters(L),
      0,
    )
  })

  it('borne aux extrémités plutôt que d’extrapoler', () => {
    const portion = slicePolyline(L, -50, 10_000)
    expect(portion[0]).toEqual(L[0])
    expect(portion[portion.length - 1]).toEqual(L[L.length - 1])
  })

  it('rend un segment droit quand la portion ne contient aucun sommet', () => {
    const portion = slicePolyline(L, 10, 40)
    expect(portion).toHaveLength(2)
    expect(polylineLengthMeters(portion)).toBeCloseTo(30, 0)
  })

  it('ne rend rien pour une portion vide ou inversée', () => {
    expect(slicePolyline(L, 80, 80)).toEqual([])
    expect(slicePolyline(L, 120, 40)).toEqual([])
  })

  it('ne rend rien pour une polyligne dégénérée', () => {
    expect(slicePolyline([[0, 0]], 0, 100)).toEqual([])
    expect(slicePolyline([], 0, 100)).toEqual([])
  })
})
