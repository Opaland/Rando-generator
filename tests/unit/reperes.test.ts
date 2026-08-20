import { describe, it, expect } from 'vitest'
import { REPERE_MAX_METERS, reperesDuProfil } from '../../src/core/reperes.ts'
import type { ElevationProfile, PointOfInterest } from '../../src/core/types.ts'

/**
 * Repères nommés sur le profil altimétrique.
 *
 * En montagne, un itinéraire se raconte par ses cols : c'est là qu'on
 * bascule. Un profil alpin sans nom de col est une courbe sans repère — on
 * voit qu'on monte de 900 m, on ne sait pas vers quoi.
 */
const PROFIL: ElevationProfile = {
  distances: [0, 1_000, 2_000, 3_000],
  elevations: [1_200, 1_800, 2_360, 1_900],
  coords: [
    [6.4, 45.2],
    [6.41, 45.2],
    [6.42, 45.2],
    [6.43, 45.2],
  ],
}

function poi(
  id: string,
  lon: number,
  lat: number,
  kind: PointOfInterest['kind'],
  name: string | null,
  elevation: string | null = null,
): PointOfInterest {
  return {
    id,
    lon,
    lat,
    kind,
    name,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

describe('reperesDuProfil', () => {
  it('place un col à sa distance le long du tracé', () => {
    const reperes = reperesDuProfil(PROFIL, [
      poi('col', 6.42, 45.2, 'pass', 'Col d’Izoard', '2360'),
    ])
    expect(reperes).toHaveLength(1)
    expect(reperes[0]?.distanceMeters).toBe(2_000)
    expect(reperes[0]?.name).toBe('Col d’Izoard')
  })

  it('ne retient que ce qui jalonne : cols, sommets, refuges', () => {
    const reperes = reperesDuProfil(PROFIL, [
      poi('col', 6.42, 45.2, 'pass', 'Col'),
      poi('sommet', 6.41, 45.2, 'peak', 'Sommet'),
      poi('refuge', 6.43, 45.2, 'hut', 'Refuge'),
      poi('vue', 6.4, 45.2, 'viewpoint', 'Point de vue'),
      poi('eau', 6.4, 45.2, 'water', 'Source'),
    ])
    // Un point de vue ou une source ne structurent pas un profil : ils
    // encombreraient une courbe qui doit rester lisible d'un coup d'œil.
    expect(reperes.map((r) => r.name)).toEqual(['Sommet', 'Col', 'Refuge'])
  })

  it('écarte ce qui est trop loin du tracé pour le jalonner', () => {
    // Le profil suit le tracé : y placer un col situé à deux kilomètres
    // raconterait une montée qu'on ne fait pas.
    const reperes = reperesDuProfil(PROFIL, [
      poi('loin', 6.42, 45.25, 'pass', 'Col lointain'),
    ])
    expect(reperes).toEqual([])
  })

  it('ignore un repère sans nom : un point anonyme n’explique rien', () => {
    expect(reperesDuProfil(PROFIL, [poi('x', 6.42, 45.2, 'pass', null)])).toEqual([])
  })

  it('classe les repères dans l’ordre de la marche', () => {
    const reperes = reperesDuProfil(PROFIL, [
      poi('c', 6.43, 45.2, 'pass', 'Troisième'),
      poi('a', 6.4, 45.2, 'peak', 'Premier'),
      poi('b', 6.42, 45.2, 'hut', 'Deuxième'),
    ])
    expect(reperes.map((r) => r.name)).toEqual([
      'Premier',
      'Deuxième',
      'Troisième',
    ])
  })

  it('reprend l’altitude taguée, sinon celle du profil', () => {
    const [tague] = reperesDuProfil(PROFIL, [
      poi('col', 6.42, 45.2, 'pass', 'Col', '2358'),
    ])
    expect(tague?.elevation).toBe(2358)
    const [sansTag] = reperesDuProfil(PROFIL, [
      poi('col', 6.42, 45.2, 'pass', 'Col'),
    ])
    // L'altitude du profil vient du service IGN : moins précise qu'un relevé
    // de terrain, mais elle situe le repère sur la courbe.
    expect(sansTag?.elevation).toBe(2360)
  })

  it('rend une liste vide sans profil exploitable', () => {
    const vide: ElevationProfile = { distances: [], elevations: [], coords: [] }
    expect(reperesDuProfil(vide, [poi('col', 6.4, 45.2, 'pass', 'Col')])).toEqual([])
  })

  it('expose le seuil au-delà duquel un point ne jalonne plus', () => {
    expect(REPERE_MAX_METERS).toBe(250)
  })
})
