import { describe, it, expect } from 'vitest'
import {
  GEO_OPTIONS,
  GEO_PERMISSION_DENIED,
  GEO_POSITION_UNAVAILABLE,
  GEO_TIMEOUT,
  formatAccuracy,
  geolocationErrorMessage,
  isAccuracyPoor,
} from '../../src/core/geolocation.ts'

describe('geolocationErrorMessage', () => {
  it('explique quoi faire pour chaque cause d’échec', () => {
    expect(geolocationErrorMessage(GEO_PERMISSION_DENIED)).toMatch(/autorisez/i)
    expect(geolocationErrorMessage(GEO_POSITION_UNAVAILABLE)).toMatch(
      /signal|GPS/i,
    )
    expect(geolocationErrorMessage(GEO_TIMEOUT)).toMatch(/temps|réessayez/i)
  })

  it('reste en français et sans code technique pour un code inconnu', () => {
    const message = geolocationErrorMessage(42)
    expect(message).toMatch(/échoué/i)
    expect(message).not.toMatch(/42|error|code/i)
  })
})

describe('formatAccuracy', () => {
  it('arrondit sans donner de fausse précision', () => {
    expect(formatAccuracy(4.2)).toBe('± 4 m')
    expect(formatAccuracy(12.7)).toBe('± 15 m')
    expect(formatAccuracy(63)).toBe('± 65 m')
  })

  it('ne produit rien pour une valeur inexploitable', () => {
    expect(formatAccuracy(Number.NaN)).toBe('')
    expect(formatAccuracy(-1)).toBe('')
  })
})

describe('isAccuracyPoor', () => {
  it('signale une position trop imprécise pour situer sur un sentier', () => {
    expect(isAccuracyPoor(8)).toBe(false)
    expect(isAccuracyPoor(50)).toBe(false)
    expect(isAccuracyPoor(120)).toBe(true)
    expect(isAccuracyPoor(Number.NaN)).toBe(true)
  })
})

describe('GEO_OPTIONS', () => {
  it('privilégie le GPS : une position à 500 m près ne sert à rien ici', () => {
    expect(GEO_OPTIONS.enableHighAccuracy).toBe(true)
    expect(GEO_OPTIONS.timeout).toBeGreaterThan(0)
  })
})
