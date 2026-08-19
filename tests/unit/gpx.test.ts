// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseGpx, GpxError } from '../../src/core/gpx.ts'
import {
  GPX_SIMPLE,
  GPX_MULTI_SEG,
  GPX_NO_TRKPT,
  GPX_MALFORMED,
  GPX_NOT_GPX,
  GPX_BAD_COORDS,
} from '../fixtures/gpx.ts'

const parser = new DOMParser()

describe('parseGpx', () => {
  it('extrait les points [lon, lat] et la date des métadonnées', () => {
    const res = parseGpx(GPX_SIMPLE, parser)
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.5001, 45.4001],
      [4.5002, 45.4002],
    ])
    expect(res.date).toBe('2024-06-15T08:30:00Z')
  })

  it('concatène les points de plusieurs trkseg', () => {
    const res = parseGpx(GPX_MULTI_SEG, parser)
    expect(res.points).toHaveLength(3)
    expect(res.points[2]).toEqual([4.3, 45.3])
  })

  it('prend la date du premier trkpt si les métadonnées n’en ont pas', () => {
    const res = parseGpx(GPX_MULTI_SEG, parser)
    expect(res.date).toBe('2023-11-02T10:00:00Z')
  })

  it('retourne 0 point (sans erreur) pour un GPX sans trkpt', () => {
    const res = parseGpx(GPX_NO_TRKPT, parser)
    expect(res.points).toEqual([])
    expect(res.date).toBeNull()
  })

  it('rejette un XML mal formé avec une GpxError en français', () => {
    expect(() => parseGpx(GPX_MALFORMED, parser)).toThrow(GpxError)
    expect(() => parseGpx(GPX_MALFORMED, parser)).toThrow(/fichier/i)
  })

  it('rejette un XML qui n’est pas un GPX', () => {
    expect(() => parseGpx(GPX_NOT_GPX, parser)).toThrow(GpxError)
  })

  it('ignore les points aux coordonnées non numériques', () => {
    const res = parseGpx(GPX_BAD_COORDS, parser)
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.7, 45.6],
    ])
  })
})
