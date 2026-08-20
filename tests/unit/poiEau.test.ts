import { describe, it, expect } from 'vitest'
import { parsePoiResponse } from '../../src/core/poi.ts'
import { mentionEau } from '../../src/lib/poiDisplay.ts'
import type { PoiDetails } from '../../src/core/types.ts'

/**
 * Potabilité des points d'eau (issue #123).
 *
 * La catégorie « eau » regroupe les fontaines et les sources. Ce ne sont pas
 * les mêmes choses : une fontaine `drinking_water` est prévue pour être bue,
 * une source `natural=spring` ne l'est pas nécessairement. Les afficher à
 * l'identique laisse entendre une potabilité que la donnée n'affirme pas —
 * et la décision qui en dépend n'est pas anodine.
 */
function reponse(tags: Record<string, string>): unknown {
  return {
    elements: [{ type: 'node', id: 1, lat: 45.4, lon: 4.5, tags }],
  }
}

describe('lecture des tags d’eau', () => {
  it('retient la potabilité déclarée', () => {
    const [poi] = parsePoiResponse(reponse({ natural: 'spring', drinking_water: 'yes' }))
    expect(poi?.details.drinkingWater).toBe('oui')
  })

  it('retient une potabilité niée, qui est l’information la plus utile', () => {
    const [poi] = parsePoiResponse(reponse({ natural: 'spring', drinking_water: 'no' }))
    expect(poi?.details.drinkingWater).toBe('non')
  })

  it('distingue une eau traitée', () => {
    const [poi] = parsePoiResponse(
      reponse({ amenity: 'drinking_water', drinking_water: 'treated' }),
    )
    expect(poi?.details.drinkingWater).toBe('traitee')
  })

  it('laisse null ce qui n’est pas renseigné, sans l’inventer', () => {
    const [poi] = parsePoiResponse(reponse({ natural: 'spring' }))
    expect(poi?.details.drinkingWater).toBeNull()
  })

  it('reconnaît une source saisonnière ou intermittente', () => {
    const [saison] = parsePoiResponse(reponse({ natural: 'spring', seasonal: 'yes' }))
    expect(saison?.details.seasonal).toBe(true)
    const [intermittente] = parsePoiResponse(
      reponse({ natural: 'spring', intermittent: 'yes' }),
    )
    expect(intermittente?.details.seasonal).toBe(true)
    const [permanente] = parsePoiResponse(reponse({ natural: 'spring' }))
    expect(permanente?.details.seasonal).toBe(false)
  })

  it('distingue une source d’une fontaine', () => {
    const [source] = parsePoiResponse(reponse({ natural: 'spring' }))
    expect(source?.details.spring).toBe(true)
    const [fontaine] = parsePoiResponse(reponse({ amenity: 'drinking_water' }))
    expect(fontaine?.details.spring).toBe(false)
  })
})

describe('mentionEau', () => {
  const details = (partiel: Partial<PoiDetails>): PoiDetails => ({
    phone: null,
    website: null,
    capacity: null,
    openingHours: null,
    operator: null,
    elevation: null,
    drinkingWater: null,
    seasonal: false,
    spring: false,
    ...partiel,
  })

  it('annonce une fontaine potable', () => {
    expect(mentionEau(details({ drinkingWater: 'oui' }))).toBe('potable')
  })

  it('annonce clairement une eau non potable', () => {
    expect(mentionEau(details({ drinkingWater: 'non' }))).toBe('non potable')
  })

  it('dit le silence d’OpenStreetMap plutôt que de se taire', () => {
    // Ne rien afficher laisserait supposer que c'est bon à boire. Le doute
    // est une information ; l'absence d'information n'en est pas une.
    expect(mentionEau(details({ spring: true }))).toBe(
      'potabilité non renseignée',
    )
  })

  it('signale une source saisonnière : tarie en août, elle ne sert à rien', () => {
    expect(mentionEau(details({ spring: true, seasonal: true }))).toBe(
      'potabilité non renseignée · saisonnière',
    )
  })

  it('ne présume rien d’une fontaine sans mention', () => {
    // Une fontaine `drinking_water` sans tag explicite est prévue pour être
    // bue : c'est sa raison d'être. On n'ajoute pas de doute là où il n'y en
    // a pas.
    expect(mentionEau(details({}))).toBeNull()
  })

  it('précise l’eau traitée', () => {
    expect(mentionEau(details({ drinkingWater: 'traitee' }))).toBe(
      'potable (traitée)',
    )
  })
})
