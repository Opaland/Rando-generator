import { describe, it, expect } from 'vitest'
import {
  empriseACadrer,
  type Emprise,
} from '../../src/core/emprisesDeZone.ts'
import { EMPRISES_DE_ZONE } from '../../src/core/emprisesDeZone.donnees.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { RAYON_AUTOUR_METERS, ZONES } from '../../src/core/overpass.ts'
import { RAYON_ELARGI_METERS } from '../../src/core/rechercheAutour.ts'

/**
 * Issue #578 — choisir une zone cadrait la moitié de la France : l'emprise
 * des GR de grande traversée emportait celle de la zone. Décision de Cédric
 * du 22/10 : la carte cadre sur l'emprise de la zone administrative.
 */
function embarquee(id: string): Emprise {
  const emprise = EMPRISES_DE_ZONE[id]
  if (!emprise) throw new Error(`Pas d'emprise embarquée pour ${id}`)
  return emprise
}

describe('empriseACadrer', () => {
  it("rend l'emprise embarquée d'une zone prédéfinie", () => {
    expect(empriseACadrer('isere')).toEqual(EMPRISES_DE_ZONE.isere)
  })

  it('a une emprise pour chaque zone prédéfinie sauf la Nouvelle-Calédonie, et aucune en trop', () => {
    expect(Object.keys(EMPRISES_DE_ZONE).sort()).toEqual(
      ZONES.map((z) => z.id)
        .filter((id) => id !== 'nouvelle-caledonie')
        .sort(),
    )
  })

  it('cadre la Nouvelle-Calédonie sur ses itinéraires : sa limite va des Chesterfield à Matthew–Hunter', () => {
    expect(empriseACadrer('nouvelle-caledonie')).toBeNull()
  })

  it('chaque emprise est une boîte non vide, plus petite qu’un département de 300 km', () => {
    for (const [id, [ouest, sud, est, nord]] of Object.entries(
      EMPRISES_DE_ZONE,
    )) {
      expect(ouest, id).toBeLessThan(est)
      expect(sud, id).toBeLessThan(nord)
      // Garde contre l'homonyme lointain ou la boîte d'un pays entier : le
      // plus grand département de la liste fait moins de 300 km de diagonale.
      const diagonale = distanceMeters([ouest, sud], [est, nord])
      expect(diagonale, id).toBeLessThan(300_000)
    }
  })

  it("l'emprise de « Rhône, Loire et Pilat » contient celles des trois", () => {
    const [o, s, e, n] = embarquee('trois')
    for (const id of ['rhone', 'loire', 'pilat']) {
      const [oi, si, ei, ni] = embarquee(id)
      expect(oi).toBeGreaterThanOrEqual(o)
      expect(si).toBeGreaterThanOrEqual(s)
      expect(ei).toBeLessThanOrEqual(e)
      expect(ni).toBeLessThanOrEqual(n)
    }
  })

  it('« autour de » cadre le cercle interrogé, centré sur le lieu', () => {
    const lon = 4.6
    const lat = 45.4
    const emprise = empriseACadrer(`autour:${String(lon)},${String(lat)}`)
    expect(emprise).not.toBeNull()
    const [ouest, sud, est, nord] = emprise ?? [0, 0, 0, 0]
    // Chaque côté est à un rayon du centre — ni plus près (le cercle serait
    // coupé), ni plus loin (on recadrerait trop large).
    expect(distanceMeters([lon, lat], [ouest, lat])).toBeCloseTo(
      RAYON_AUTOUR_METERS,
      -1,
    )
    expect(distanceMeters([lon, lat], [est, lat])).toBeCloseTo(
      RAYON_AUTOUR_METERS,
      -1,
    )
    expect(distanceMeters([lon, lat], [lon, sud])).toBeCloseTo(
      RAYON_AUTOUR_METERS,
      -1,
    )
    expect(distanceMeters([lon, lat], [lon, nord])).toBeCloseTo(
      RAYON_AUTOUR_METERS,
      -1,
    )
  })

  it('« autour de » élargi cadre le cercle élargi, pas celui d’origine (#591)', () => {
    const emprise = empriseACadrer(`autour:166.45,-22.27,${String(RAYON_ELARGI_METERS)}`)
    expect(emprise).not.toBeNull()
    const [ouest] = emprise ?? [0]
    expect(distanceMeters([166.45, -22.27], [ouest, -22.27])).toBeCloseTo(
      RAYON_ELARGI_METERS,
      -1,
    )
  })

  it("ne propose rien pour une recherche par ref : l'itinéraire est la zone", () => {
    expect(empriseACadrer('ref:GR 7')).toBeNull()
  })

  it('ne propose rien sans zone, ni pour une zone inconnue ou une clé illisible', () => {
    expect(empriseACadrer(null)).toBeNull()
    expect(empriseACadrer('vercors')).toBeNull()
    expect(empriseACadrer('autour:abc,45')).toBeNull()
    expect(empriseACadrer('autour:4.6')).toBeNull()
  })
})
