import { describe, it, expect } from 'vitest'
import { lienOpenStreetMap, ZOOM_TROU } from '../../src/core/lienOsm.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { GeometryGap } from '../../src/core/dataQuality.ts'

/**
 * Issue #160 — rendre à OpenStreetMap ce qu'on lui doit.
 *
 * Sentiers dit la qualité de sa donnée au lieu de la maquiller : les
 * relations trouées sont signalées, le nombre de morceaux et les kilomètres
 * d'interruption donnés. Et là, ça s'arrêtait. Marc, baliseur bénévole, voit
 * qu'il manque 12 km à une relation, connaît le terrain mieux qu'OSM — et
 * n'avait aucun moyen d'aller le corriger depuis ici.
 *
 * C'est le seul endroit du produit où la valeur remonte vers la communauté
 * dont il dépend entièrement.
 */

const GR = makeItinerary(7, [
  { osmWayId: 10, coords: straightLine(4.5, 45.4, 2_000, 100) },
])

function trou(lon: number, lat: number, metres: number): GeometryGap {
  return { from: [lon, lat], to: [lon + 0.01, lat], meters: metres }
}

describe('lienOpenStreetMap', () => {
  it('mène à la relation', () => {
    const lien = lienOpenStreetMap(GR, [])
    expect(lien).toBe('https://www.openstreetmap.org/relation/7')
  })

  /**
   * Cadré sur le trou quand on sait le situer — c'est tout l'intérêt : Marc
   * arrive à l'endroit qui manque, pas au début d'un GR de 400 km.
   */
  it('cadre sur l’interruption quand elle est connue', () => {
    const lien = lienOpenStreetMap(GR, [trou(4.5, 45.4, 12_000)])
    expect(lien).toContain('/relation/7')
    expect(lien).toContain(`#map=${String(ZOOM_TROU)}/45.4`)
  })

  /** Les trous arrivent triés du plus grand au plus petit : on vise le premier. */
  it('vise le plus grand trou, pas le premier venu', () => {
    const lien = lienOpenStreetMap(GR, [
      trou(4.9, 45.9, 12_000),
      trou(4.5, 45.4, 300),
    ])
    expect(lien).toContain('/45.9')
  })

  /** Le milieu du trou, et non son bord : c'est le vide qu'on veut voir. */
  it('vise le milieu de l’interruption', () => {
    const lien = lienOpenStreetMap(GR, [
      { from: [4.5, 45.4], to: [4.6, 45.5], meters: 12_000 },
    ])
    expect(lien).toContain('/45.45')
    expect(lien).toContain('/4.55')
  })

  /**
   * Ce qui ne vient pas d'OpenStreetMap n'y a pas de page. Un lien vers
   * `relation/-3` mènerait à une erreur 404, et laisserait croire que la
   * donnée est là-bas alors qu'elle vient d'ailleurs.
   */
  it('ne rend rien pour un itinéraire qui n’est pas une relation OSM', () => {
    const perso = makeItinerary(-3, GR.ways, { network: 'PERSO' })
    expect(lienOpenStreetMap(perso, [])).toBeNull()
    const local = makeItinerary(123, GR.ways, { network: 'LOCAL' })
    expect(lienOpenStreetMap(local, [])).toBeNull()
  })

  it('accepte les trois réseaux qui viennent d’OSM', () => {
    for (const network of ['GR', 'GRP', 'PR'] as const) {
      expect(lienOpenStreetMap(makeItinerary(7, GR.ways, { network }), [])).toBe(
        'https://www.openstreetmap.org/relation/7',
      )
    }
  })
})
