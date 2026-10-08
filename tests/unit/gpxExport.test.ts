import { describe, it, expect } from 'vitest'
import {
  buildGpxDocument,
  gpxAttributionFor,
  gpxDocumentFromTrack,
  gpxFilename,
} from '../../src/core/gpxExport.ts'
import type { LonLat, Track } from '../../src/core/types.ts'

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

  it('pose un <time> par point quand pointTimes les fournit (issue sprint 1, export de sortie)', () => {
    const horodate = buildGpxDocument({
      name: 'Avec horaires',
      coords: COORDS,
      attribution: null,
      createdAt: CREATED_AT,
      pointTimes: [
        '2026-08-19T21:30:00.000Z',
        '2026-08-19T21:35:00.000Z',
        null,
      ],
    })
    const tempsParPoint = horodate.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/g) ?? []
    expect(tempsParPoint).toHaveLength(3)
    expect(tempsParPoint[0]).toContain(
      '<time>2026-08-19T21:30:00.000Z</time>',
    )
    expect(tempsParPoint[1]).toContain(
      '<time>2026-08-19T21:35:00.000Z</time>',
    )
    // Le troisième point n'a pas d'horaire (`null`) : pas de <time> inventé.
    expect(tempsParPoint[2]).not.toContain('<time>')
  })

  it('ne pose aucun <time> de point sans pointTimes', () => {
    expect(gpx).not.toMatch(/<trkpt[^>]*>[\s\S]*?<time>/)
  })
})

describe('gpxDocumentFromTrack', () => {
  const traceEnregistree: Track = {
    id: 'sortie-1',
    filename: 'Sortie enregistrée',
    points: COORDS,
    date: '2026-08-23T08:00:00.000Z',
    importedAt: '2026-08-23T11:00:00.000Z',
    times: [1755936000000, 1755936300000, null],
  }

  it('exporte une sortie enregistrée sans rien attribuer à un tiers', () => {
    const gpx = gpxDocumentFromTrack(traceEnregistree)
    expect(gpx).not.toContain('<copyright')
    expect(gpx).toContain('<name>Sortie enregistrée</name>')
    // La date de la sortie (son début), pas celle de l'écriture en base.
    expect(gpx).toContain('<time>2026-08-23T08:00:00.000Z</time>')
  })

  it('convertit les instants bruts (ms) de la trace en horaires GPX', () => {
    const gpx = gpxDocumentFromTrack(traceEnregistree)
    const tempsParPoint = gpx.match(/<trkpt[^>]*>[\s\S]*?<\/trkpt>/g) ?? []
    expect(tempsParPoint[0]).toContain(
      `<time>${new Date(1755936000000).toISOString()}</time>`,
    )
    expect(tempsParPoint[2]).not.toContain('<time>')
  })

  it('retombe sur la date d’import quand la trace importée n’a pas de date', () => {
    const importee: Track = {
      id: 'import-1',
      filename: 'activity_18274639.gpx',
      points: COORDS,
      date: null,
      importedAt: '2026-08-23T11:00:00.000Z',
    }
    const gpx = gpxDocumentFromTrack(importee)
    expect(gpx).toContain('<time>2026-08-23T11:00:00.000Z</time>')
  })

  it('retire l’extension du nom de fichier pour le nom affiché, sans en inventer un pour une sortie qui n’en a pas', () => {
    const importee: Track = {
      id: 'import-1',
      filename: 'activity_18274639.gpx',
      points: COORDS,
      date: null,
      importedAt: CREATED_AT,
    }
    expect(gpxDocumentFromTrack(importee)).toContain(
      '<name>activity_18274639</name>',
    )
    expect(gpxDocumentFromTrack(traceEnregistree)).toContain(
      '<name>Sortie enregistrée</name>',
    )
  })

  it('n’écrit aucun <time> de point quand la trace n’en porte pas', () => {
    const sansHoraires: Track = {
      id: 'import-2',
      filename: 'vieille-trace.gpx',
      points: COORDS,
      date: '2026-01-01T00:00:00.000Z',
      importedAt: CREATED_AT,
    }
    const gpx = gpxDocumentFromTrack(sansHoraires)
    expect(gpx).not.toMatch(/<trkpt[^>]*>[\s\S]*?<time>/)
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
