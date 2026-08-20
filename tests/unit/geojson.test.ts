import { describe, it, expect } from 'vitest'
import {
  GeoJsonError,
  looksLikeGeoJson,
  parseGeoJsonTrails,
} from '../../src/core/geojson.ts'

/**
 * Import d'un GeoJSON de sentiers (issue #87).
 *
 * Les PDIPR départementaux — Ain, Isère, et les autres à mesure qu'ils
 * s'ouvrent — sont publiés en GeoJSON. Plutôt que d'embarquer un lecteur par
 * département, chacun avec son schéma, on lit le format : la géométrie y est
 * normalisée, seuls les noms de propriétés varient.
 */
function ligne(coords: [number, number][]): unknown {
  return {
    type: 'Feature',
    properties: { nom: 'Sentier des Crêtes' },
    geometry: { type: 'LineString', coordinates: coords },
  }
}

function collection(features: unknown[]): unknown {
  return { type: 'FeatureCollection', features }
}

describe('looksLikeGeoJson', () => {
  it('reconnaît un FeatureCollection', () => {
    expect(
      looksLikeGeoJson('{"type":"FeatureCollection","features":[]}'),
    ).toBe(true)
  })

  it('ne prend pas un GPX ni un JSON quelconque pour un GeoJSON', () => {
    expect(looksLikeGeoJson('<?xml version="1.0"?><gpx/>')).toBe(false)
    expect(looksLikeGeoJson('{"elements":[]}')).toBe(false)
  })
})

describe('parseGeoJsonTrails', () => {
  it('lit une LineString et son nom', () => {
    const trails = parseGeoJsonTrails(
      collection([
        ligne([
          [4.5, 45.4],
          [4.51, 45.41],
        ]),
      ]),
    )
    expect(trails).toHaveLength(1)
    expect(trails[0]?.name).toBe('Sentier des Crêtes')
    expect(trails[0]?.lines[0]).toHaveLength(2)
  })

  it('lit une MultiLineString comme un itinéraire en plusieurs tronçons', () => {
    const trails = parseGeoJsonTrails(
      collection([
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [4.5, 45.4],
                [4.51, 45.4],
              ],
              [
                [4.52, 45.4],
                [4.53, 45.4],
              ],
            ],
          },
        },
      ]),
    )
    expect(trails[0]?.lines).toHaveLength(2)
  })

  it('cherche le nom parmi les intitulés courants des jeux français', () => {
    // Chaque producteur nomme sa colonne à sa façon. On en connaît quelques
    // unes ; les autres donneront un itinéraire sans nom, pas une erreur.
    for (const cle of ['nom', 'name', 'libelle', 'intitule', 'titre']) {
      const trails = parseGeoJsonTrails(
        collection([
          {
            type: 'Feature',
            properties: { [cle]: `Par ${cle}` },
            geometry: {
              type: 'LineString',
              coordinates: [
                [4.5, 45.4],
                [4.51, 45.4],
              ],
            },
          },
        ]),
      )
      expect(trails[0]?.name, cle).toBe(`Par ${cle}`)
    }
  })

  it('accepte un itinéraire sans nom plutôt que de l’écarter', () => {
    const trails = parseGeoJsonTrails(
      collection([
        {
          type: 'Feature',
          properties: { code_troncon: 42 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [4.5, 45.4],
              [4.51, 45.4],
            ],
          },
        },
      ]),
    )
    expect(trails[0]?.name).toBeNull()
  })

  it('ignore ce qui n’est pas une ligne, sans en faire une erreur', () => {
    // Un jeu de PDIPR contient aussi des poteaux, des parkings, des zones.
    const trails = parseGeoJsonTrails(
      collection([
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [4.5, 45.4] },
        },
        ligne([
          [4.5, 45.4],
          [4.51, 45.4],
        ]),
      ]),
    )
    expect(trails).toHaveLength(1)
  })

  it('accepte une Feature seule ou une géométrie nue', () => {
    expect(
      parseGeoJsonTrails(
        ligne([
          [4.5, 45.4],
          [4.51, 45.4],
        ]),
      ),
    ).toHaveLength(1)
    expect(
      parseGeoJsonTrails({
        type: 'LineString',
        coordinates: [
          [4.5, 45.4],
          [4.51, 45.4],
        ],
      }),
    ).toHaveLength(1)
  })

  it('refuse des coordonnées qui ne sont pas en WGS84', () => {
    // Le piège des données françaises : beaucoup de jeux sont publiés en
    // Lambert 93. Tracées telles quelles, les lignes atterriraient dans le
    // golfe de Guinée. Mieux vaut le dire que de dessiner n'importe où.
    expect(() =>
      parseGeoJsonTrails(
        collection([
          ligne([
            [842_000, 6_517_000],
            [842_100, 6_517_100],
          ]),
        ]),
      ),
    ).toThrow(/Lambert|projet/i)
  })

  it('écarte une ligne dégénérée sans faire échouer le reste', () => {
    const trails = parseGeoJsonTrails(
      collection([
        ligne([[4.5, 45.4]]),
        ligne([
          [4.5, 45.4],
          [4.51, 45.4],
        ]),
      ]),
    )
    expect(trails).toHaveLength(1)
  })

  it('refuse ce qui n’est pas du GeoJSON', () => {
    expect(() => parseGeoJsonTrails({ elements: [] })).toThrow(GeoJsonError)
    expect(() => parseGeoJsonTrails(null)).toThrow(GeoJsonError)
  })

  it('rend une liste vide pour une collection sans ligne', () => {
    // Le fichier est valide, il ne contient simplement aucun sentier.
    expect(parseGeoJsonTrails(collection([]))).toEqual([])
  })
})
