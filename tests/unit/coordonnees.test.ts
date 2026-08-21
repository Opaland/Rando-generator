import { describe, it, expect } from 'vitest'
import {
  estDansLeMonde,
  messagePointsHorsLimites,
} from '../../src/core/coordonnees.ts'

describe('estDansLeMonde', () => {
  it('accepte une coordonnée ordinaire', () => {
    expect(estDansLeMonde(4.5, 45.4)).toBe(true)
  })

  it('accepte les bornes exactes', () => {
    // Le pôle et l'antiméridien sont des positions valides : les exclure
    // écarterait des traces réelles pour rien.
    expect(estDansLeMonde(180, 90)).toBe(true)
    expect(estDansLeMonde(-180, -90)).toBe(true)
    expect(estDansLeMonde(0, 0)).toBe(true)
  })

  it('refuse ce qui ne tombe pas sur Terre', () => {
    expect(estDansLeMonde(200, 95)).toBe(false)
    expect(estDansLeMonde(4.5, 90.000001)).toBe(false)
    expect(estDansLeMonde(180.000001, 45.4)).toBe(false)
    expect(estDansLeMonde(-181, 45.4)).toBe(false)
    expect(estDansLeMonde(4.5, -91)).toBe(false)
  })

  it('refuse ce qui n’est pas un nombre exploitable', () => {
    expect(estDansLeMonde(NaN, 45.4)).toBe(false)
    expect(estDansLeMonde(4.5, NaN)).toBe(false)
    expect(estDansLeMonde(Infinity, 45.4)).toBe(false)
    expect(estDansLeMonde(4.5, -Infinity)).toBe(false)
  })

  it('refuse des coordonnées projetées prises pour des degrés', () => {
    // Lambert 93 en mètres : le cas qui motive l'issue #167.
    expect(estDansLeMonde(842_000, 6_519_000)).toBe(false)
  })
})

describe('messagePointsHorsLimites', () => {
  it('ne dit rien quand il n’y a rien à dire', () => {
    expect(messagePointsHorsLimites(0)).toBeNull()
  })

  it('accorde le singulier', () => {
    expect(messagePointsHorsLimites(1)).toBe(
      '1 point hors limites a été ignoré.',
    )
  })

  it('accorde le pluriel', () => {
    expect(messagePointsHorsLimites(12)).toBe(
      '12 points hors limites ont été ignorés.',
    )
  })
})
