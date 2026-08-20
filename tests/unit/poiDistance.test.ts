import { describe, it, expect } from 'vitest'
import { situerPois, type PoiSitue } from '../../src/core/poiDistance.ts'
import type { LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Distance des points d'intérêt au tracé (issue #122).
 *
 * Les POI sont cherchés par boîtes englobantes, larges de plusieurs
 * kilomètres : « le long de l'itinéraire » ne veut rien dire tant qu'on n'a
 * pas mesuré. Un détour de vingt minutes et un détour d'une demi-journée ne
 * se décident pas pareil.
 */
const TRACE: LonLat[] = [
  [4.5, 45.4],
  [4.6, 45.4],
]

function poi(id: string, lon: number, lat: number): PointOfInterest {
  return {
    id,
    lon,
    lat,
    kind: 'water',
    name: id,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
    },
  }
}

describe('situerPois', () => {
  it('mesure la distance au tracé, pas au point de départ', () => {
    // Au milieu du tracé, décalé de 0,001° au nord — soit ~111 m. Mesuré
    // depuis le départ, il serait à 4 km.
    const [situe] = situerPois([poi('source', 4.55, 45.401)], TRACE)
    expect(situe?.distanceMeters).toBeGreaterThan(100)
    expect(situe?.distanceMeters).toBeLessThan(120)
  })

  it('compte le détour comme un aller-retour', () => {
    // C'est ce que l'utilisateur veut savoir : ce que la source lui coûte,
    // pas où elle se trouve.
    const [situe] = situerPois([poi('source', 4.55, 45.401)], TRACE)
    expect(situe?.detourMeters).toBeCloseTo((situe?.distanceMeters ?? 0) * 2, 5)
  })

  it('rend zéro pour un point posé sur le tracé', () => {
    const [situe] = situerPois([poi('sur-place', 4.55, 45.4)], TRACE)
    expect(situe?.distanceMeters).toBeLessThan(1)
  })

  it('ne masque rien, même très loin du tracé', () => {
    // Un sommet à cinq kilomètres est un détour que certains feront : le
    // cacher déciderait à leur place. Le chiffre affiché, lui, laisse
    // trancher.
    const situes = situerPois(
      [poi('proche', 4.55, 45.401), poi('lointain', 4.55, 45.45)],
      TRACE,
    )
    expect(situes.map((s) => s.id)).toEqual(['proche', 'lointain'])
    expect(situes[1]?.detourMeters).toBeGreaterThan(10_000)
  })

  it('trie du plus proche au plus lointain', () => {
    const situes = situerPois(
      [
        poi('moyen', 4.55, 45.403),
        poi('tout-pres', 4.55, 45.4001),
        poi('loin', 4.55, 45.404),
      ],
      TRACE,
    )
    expect(situes.map((s) => s.id)).toEqual(['tout-pres', 'moyen', 'loin'])
  })

  it('mesure sur le segment, pas seulement sur les sommets', () => {
    // Un tracé décrit par deux points distants : un POI au milieu est proche
    // du chemin même s'il est loin des deux extrémités. C'est la différence
    // entre suivre un sentier et pointer ses bornes.
    const situes = situerPois([poi('milieu', 4.55, 45.4)], TRACE)
    expect(situes[0]?.distanceMeters).toBeLessThan(1)
  })

  it('rend une liste vide sans tracé exploitable', () => {
    expect(situerPois([poi('a', 4.5, 45.4)], [])).toEqual([])
    expect(situerPois([poi('a', 4.5, 45.4)], [[4.5, 45.4]])).toHaveLength(1)
  })

  it('conserve tout ce que le POI portait', () => {
    const [situe] = situerPois([poi('source', 4.55, 45.4)], TRACE)
    const complet: PoiSitue | undefined = situe
    expect(complet?.name).toBe('source')
    expect(complet?.kind).toBe('water')
  })
})
