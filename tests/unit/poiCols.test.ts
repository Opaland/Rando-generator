import { describe, it, expect } from 'vitest'
import { buildPoiQuery, parsePoiResponse } from '../../src/core/poi.ts'
import { POI_LABELS } from '../../src/lib/poiDisplay.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Cols (issue à créer, question posée à l'usage le 20/08).
 *
 * En montagne, un itinéraire se raconte par ses cols : c'est là qu'on bascule,
 * qu'on souffle, qu'on décide de continuer ou de redescendre. Un profil
 * altimétrique alpin sans nom de col est une courbe sans repère.
 */
const TRACE: LonLat[] = [
  [6.4, 45.2],
  [6.41, 45.21],
]

function reponse(tags: Record<string, string>): unknown {
  return { elements: [{ type: 'node', id: 1, lat: 45.2, lon: 6.4, tags }] }
}

describe('cols', () => {
  it('sont demandés à Overpass', () => {
    const requete = buildPoiQuery(TRACE)
    expect(requete).toContain('saddle')
    expect(requete).toContain('mountain_pass')
  })

  it('reconnaît un col tagué natural=saddle', () => {
    const [col] = parsePoiResponse(reponse({ natural: 'saddle', name: 'Col du Glandon' }))
    expect(col?.kind).toBe('pass')
    expect(col?.name).toBe('Col du Glandon')
  })

  it('reconnaît un col tagué mountain_pass=yes', () => {
    // Les deux tags coexistent dans OSM ; certains cols ne portent que le
    // second, souvent sur un nœud partagé avec une route.
    const [col] = parsePoiResponse(reponse({ mountain_pass: 'yes', name: 'Col de la Croix' }))
    expect(col?.kind).toBe('pass')
  })

  it('garde l’altitude du col, qui est la moitié de l’information', () => {
    const [col] = parsePoiResponse(
      reponse({ natural: 'saddle', name: 'Col d’Izoard', ele: '2360' }),
    )
    expect(col?.details.elevation).toBe('2360')
  })

  it('ne confond pas un col avec un sommet', () => {
    const [sommet] = parsePoiResponse(reponse({ natural: 'peak', name: 'Mont Thabor' }))
    expect(sommet?.kind).toBe('peak')
  })

  it('porte un libellé lisible', () => {
    expect(POI_LABELS.pass).toBe('Col')
  })
})
