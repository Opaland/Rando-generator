import { describe, it, expect } from 'vitest'
import {
  buildGpxDocument,
  gpxAttributionFor,
  gpxFilename,
} from '../../src/core/gpxExport.ts'
import type { LonLat } from '../../src/core/types.ts'

const COORDS: LonLat[] = [
  [4.5, 45.4],
  [4.505, 45.401],
  [4.51, 45.402],
]
const CREATED_AT = '2026-08-19T21:30:00.000Z'

describe('buildGpxDocument', () => {
  const gpx = buildGpxDocument({
    name: 'Boucle du Crêt',
    coords: COORDS,
    attribution: null,
    createdAt: CREATED_AT,
  })

  it('produit un GPX 1.1 lisible par un GPS', () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
    expect(gpx).toContain('creator="Sentiers"')
    expect(gpx).toContain('</gpx>')
  })

  it('écrit un point de trace par coordonnée, en lat/lon', () => {
    const points = gpx.match(/<trkpt /g) ?? []
    expect(points).toHaveLength(3)
    expect(gpx).toContain('<trkpt lat="45.4000000" lon="4.5000000"')
  })

  it('reprend le nom dans les métadonnées et la trace', () => {
    expect(gpx).toContain('<name>Boucle du Crêt</name>')
    expect(gpx.match(/<name>Boucle du Crêt<\/name>/g)).toHaveLength(2)
    expect(gpx).toContain(`<time>${CREATED_AT}</time>`)
  })

  it('échappe les caractères spéciaux XML du nom', () => {
    const piege = buildGpxDocument({
      name: 'Rand<o> & "co" \'2026\'',
      coords: COORDS,
      attribution: null,
      createdAt: CREATED_AT,
    })
    expect(piege).toContain('Rand&lt;o&gt; &amp; &quot;co&quot; &apos;2026&apos;')
    expect(piege).not.toContain('<o>')
  })

  it('inscrit l’attribution avant <time> (ordre imposé par le schéma GPX)', () => {
    const attribue = buildGpxDocument({
      name: 'GR 7',
      coords: COORDS,
      attribution: {
        author: 'les contributeurs OpenStreetMap',
        license: 'https://opendatacommons.org/licenses/odbl/',
      },
      createdAt: CREATED_AT,
    })
    expect(attribue).toContain(
      '<copyright author="les contributeurs OpenStreetMap">',
    )
    expect(attribue).toContain(
      '<license>https://opendatacommons.org/licenses/odbl/</license>',
    )
    // metadataType impose : name, desc, author, copyright, link, time…
    expect(attribue.indexOf('<copyright')).toBeLessThan(
      attribue.indexOf('<time>'),
    )
  })

  it('omet le bloc copyright quand il n’y a rien à attribuer', () => {
    expect(gpx).not.toContain('<copyright')
  })

  it('refuse un tracé vide', () => {
    expect(() =>
      buildGpxDocument({
        name: 'Vide',
        coords: [],
        attribution: null,
        createdAt: CREATED_AT,
      }),
    ).toThrow()
  })
})

describe('gpxAttributionFor', () => {
  it('attribue les réseaux OSM à leurs contributeurs, sous ODbL', () => {
    for (const network of ['GR', 'GRP', 'PR'] as const) {
      const attribution = gpxAttributionFor(network)
      expect(attribution?.author).toMatch(/OpenStreetMap/)
      expect(attribution?.license).toMatch(/odbl/i)
    }
  })

  it('attribue les boucles locales à leur producteur, sous Licence Ouverte', () => {
    const attribution = gpxAttributionFor('LOCAL')
    expect(attribution?.author).toMatch(/Métropole de Lyon/)
    expect(attribution?.license).toMatch(/etalab/i)
  })

  it('n’attribue rien pour un itinéraire créé par l’utilisateur', () => {
    expect(gpxAttributionFor('PERSO')).toBeNull()
  })
})

describe('gpxFilename', () => {
  it('fabrique un nom de fichier sûr et lisible', () => {
    expect(gpxFilename('Boucle du Crêt')).toBe('sentiers-boucle-du-cret.gpx')
    expect(gpxFilename('GR 7 — Traversée du Pilat')).toBe(
      'sentiers-gr-7-traversee-du-pilat.gpx',
    )
  })

  it('neutralise les caractères interdits dans un nom de fichier', () => {
    expect(gpxFilename('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\:*?"<>|]/)
  })

  it('retombe sur un nom par défaut si le nom est vide ou illisible', () => {
    expect(gpxFilename('')).toBe('sentiers-itineraire.gpx')
    expect(gpxFilename('???')).toBe('sentiers-itineraire.gpx')
  })
})
