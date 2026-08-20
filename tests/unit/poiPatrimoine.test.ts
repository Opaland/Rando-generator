import { describe, it, expect } from 'vitest'
import { buildPoiQuery, parsePoiResponse } from '../../src/core/poi.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Patrimoine croisé en chemin (issue #124).
 *
 * La requête ne demandait que `historic=monument` et `memorial` : le
 * patrimoine commémoratif, c'est-à-dire une petite part de ce qu'on croise en
 * randonnée. Manquaient les ruines qu'on va voir en montant, et surtout les
 * croix de chemin et bornes — la signalétique ancienne qui borde les GR.
 */
const TRACE: LonLat[] = [
  [4.5, 45.4],
  [4.51, 45.41],
]

function reponse(tags: Record<string, string>): unknown {
  return { elements: [{ type: 'node', id: 1, lat: 45.4, lon: 4.5, tags }] }
}

describe('buildPoiQuery — patrimoine', () => {
  const requete = buildPoiQuery(TRACE)

  it('demande les vestiges qu’on va voir', () => {
    expect(requete).toMatch(/ruins\|castle\|fort\|tower|ruins/)
    expect(requete).toContain('archaeological_site')
  })

  it('demande la signalétique ancienne des chemins', () => {
    expect(requete).toContain('wayside_cross')
    expect(requete).toContain('boundary_stone')
  })

  it('garde un filtrage strict, sans ouvrir la vanne du bruit urbain', () => {
    // Pas de `historic` en clause ouverte : sur un tracé périurbain, elle
    // ramènerait plaques et bâtiments par centaines.
    expect(requete).not.toMatch(/\["historic"\]/)
  })
})

describe('classement du patrimoine', () => {
  it('distingue un vestige d’un simple monument', () => {
    const [ruine] = parsePoiResponse(reponse({ historic: 'ruins', name: 'Vieux château' }))
    expect(ruine?.kind).toBe('ruins')
    const [chateau] = parsePoiResponse(reponse({ historic: 'castle' }))
    expect(chateau?.kind).toBe('ruins')
    const [site] = parsePoiResponse(reponse({ historic: 'archaeological_site' }))
    expect(site?.kind).toBe('ruins')
  })

  it('range croix, bornes et oratoires avec la signalétique du chemin', () => {
    for (const valeur of ['wayside_cross', 'wayside_shrine', 'boundary_stone']) {
      const [poi] = parsePoiResponse(reponse({ historic: valeur }))
      expect(poi?.kind, valeur).toBe('marker')
    }
  })

  it('garde monument et mémorial dans leur catégorie', () => {
    const [monument] = parsePoiResponse(reponse({ historic: 'monument' }))
    expect(monument?.kind).toBe('monument')
    const [memorial] = parsePoiResponse(reponse({ historic: 'memorial' }))
    expect(memorial?.kind).toBe('monument')
  })

  it('accepte moulins à eau et à vent, qui jalonnent les vallées', () => {
    const [moulin] = parsePoiResponse(reponse({ man_made: 'watermill' }))
    expect(moulin?.kind).toBe('ruins')
  })

  it('ignore ce qui n’est pas du patrimoine de randonnée', () => {
    expect(parsePoiResponse(reponse({ historic: 'building' }))).toEqual([])
    expect(parsePoiResponse(reponse({ man_made: 'antenna' }))).toEqual([])
  })
})
