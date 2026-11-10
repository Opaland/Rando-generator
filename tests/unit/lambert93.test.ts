import { describe, it, expect } from 'vitest'
import { lambert93VersWgs84 } from '../../src/core/lambert93.ts'

/**
 * Le PDIPR du Rhône arrive en Lambert-93 (EPSG:2154), en shapefile, reçu
 * par le Département le 06/11 : la carte, elle, ne lit que du WGS84 (#87).
 *
 * L'aller est écrit ici en forme fermée (IGN, note NTG_71, ALG0003), et le
 * module ne fait que le retour, par itération : comparer les deux n'est donc
 * pas recopier la même formule des deux côtés.
 */
const E = 0.0818191910428158
const N = 0.725607765053267
const C = 11754255.426096
const XS = 700000
const YS = 12655612.049876

function aller(lon: number, lat: number): [number, number] {
  const phi = (lat * Math.PI) / 180
  const latIso =
    Math.log(Math.tan(Math.PI / 4 + phi / 2)) -
    (E / 2) * Math.log((1 + E * Math.sin(phi)) / (1 - E * Math.sin(phi)))
  const r = C * Math.exp(-N * latIso)
  const gamma = N * (((lon - 3) * Math.PI) / 180)
  return [XS + r * Math.sin(gamma), YS - r * Math.cos(gamma)]
}

describe('lambert93VersWgs84', () => {
  it('rend l’origine de la projection : 3° E, 46,5° N', () => {
    const [lon, lat] = lambert93VersWgs84(700000, 6600000)
    expect(lon).toBeCloseTo(3, 9)
    expect(lat).toBeCloseTo(46.5, 9)
  })

  it.each([
    ['Lyon', 4.8357, 45.764],
    ['Villefranche-sur-Saône', 4.7189, 45.9898],
    ['Brest', -4.4861, 48.3904],
    ['Menton', 7.4975, 43.7747],
  ])('retrouve %s à moins d’un centimètre', (_, lon, lat) => {
    const [x, y] = aller(lon, lat)
    const [l, p] = lambert93VersWgs84(x, y)
    // 1e-7° ≈ 1 cm : bien en deçà des 5 m de la simplification.
    expect(Math.abs(l - lon)).toBeLessThan(1e-7)
    expect(Math.abs(p - lat)).toBeLessThan(1e-7)
  })
})
