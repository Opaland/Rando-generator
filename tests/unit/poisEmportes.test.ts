import { describe, it, expect } from 'vitest'
import {
  choisirPois,
  mentionPoisEmportes,
  type PoisEmportes,
} from '../../src/core/poisEmportes.ts'
import type { PointOfInterest } from '../../src/core/types.ts'

/**
 * Issue #153, quatrième pierre — les points d'intérêt hors ligne.
 *
 * Overpass répond en `POST`, et le Cache API ne sait pas ranger une requête
 * `POST` : les POI ne peuvent pas suivre le chemin des tuiles. Ils passent
 * donc par IndexedDB, et cela change la question posée ici.
 *
 * Une tuile périmée reste une tuile juste — le relief ne bouge pas. Un
 * point d'eau, si : il peut avoir été supprimé d'OpenStreetMap, ou tari.
 * Servir un POI emporté il y a trois mois **sans le dire** serait la
 * promesse que le service worker refuse depuis toujours de faire. On le
 * sert donc, et on dit d'où il vient et de quand il date.
 */

function poi(id: string): PointOfInterest {
  return {
    id,
    lon: 4.5,
    lat: 45.4,
    kind: 'water',
    name: null,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

const EMPORTES: PoisEmportes = {
  itineraryId: 42,
  pois: [poi('node/1'), poi('node/2')],
  recuperesLe: '2026-06-15T08:00:00.000Z',
}

describe('choisirPois', () => {
  it('préfère ce que le réseau vient de dire', () => {
    const frais = [poi('node/9')]
    expect(choisirPois(frais, EMPORTES)).toEqual({
      pois: frais,
      source: 'reseau',
      recuperesLe: null,
    })
  })

  /**
   * La distinction qui porte tout : `[]` veut dire « Overpass a répondu, il
   * n'y a rien ici », `null` veut dire « on n'a pas pu demander ». Les
   * confondre ferait passer une panne de réseau pour un désert.
   */
  it('ne remplace pas un vrai vide par de vieilles données', () => {
    expect(choisirPois([], EMPORTES)).toEqual({
      pois: [],
      source: 'reseau',
      recuperesLe: null,
    })
  })

  it('se rabat sur ce qu’on avait emporté quand le réseau a manqué', () => {
    expect(choisirPois(null, EMPORTES)).toEqual({
      pois: EMPORTES.pois,
      source: 'emporte',
      recuperesLe: EMPORTES.recuperesLe,
    })
  })

  it('ne prétend rien quand il n’y a ni réseau ni réserve', () => {
    expect(choisirPois(null, null)).toEqual({
      pois: [],
      source: 'aucune',
      recuperesLe: null,
    })
  })

  /** Une réserve vide n'est pas une réserve : ne pas l'annoncer comme telle. */
  it('traite une réserve vide comme une absence de réserve', () => {
    const vide: PoisEmportes = { ...EMPORTES, pois: [] }
    expect(choisirPois(null, vide)).toEqual({
      pois: [],
      source: 'aucune',
      recuperesLe: null,
    })
  })
})

describe('mentionPoisEmportes', () => {
  const MAINTENANT = new Date('2026-06-18T09:00:00.000Z')

  it('ne dit rien quand les points viennent du réseau', () => {
    expect(
      mentionPoisEmportes(
        { pois: [poi('node/1')], source: 'reseau', recuperesLe: null },
        MAINTENANT,
      ),
    ).toBeNull()
  })

  it('dit d’où ils viennent et de quand ils datent', () => {
    expect(
      mentionPoisEmportes(
        { pois: EMPORTES.pois, source: 'emporte', recuperesLe: EMPORTES.recuperesLe },
        MAINTENANT,
      ),
    ).toBe(
      'Emportés le 15/06/2026, il y a 3 jours. Un point d’eau peut avoir été supprimé ou tari depuis.',
    )
  })

  /**
   * Le jour même, « il y a 0 jours » se lit mal et n'apprend rien : la date
   * suffit. `formatAnciennete` dit déjà « aujourd'hui » — on s'en sert.
   */
  it('reste lisible le jour même', () => {
    expect(
      mentionPoisEmportes(
        {
          pois: EMPORTES.pois,
          source: 'emporte',
          recuperesLe: '2026-06-18T06:00:00.000Z',
        },
        MAINTENANT,
      ),
    ).toBe(
      'Emportés aujourd’hui. Un point d’eau peut avoir été supprimé ou tari depuis.',
    )
  })

  it('ne dit rien quand il n’y a rien à dire', () => {
    expect(
      mentionPoisEmportes(
        { pois: [], source: 'aucune', recuperesLe: null },
        MAINTENANT,
      ),
    ).toBeNull()
  })
})
