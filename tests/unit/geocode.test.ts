import { describe, it, expect } from 'vitest'
import {
  GeocodeError,
  buildGeocodeUrl,
  chercherLieux,
  parseGeocodeResponse,
} from '../../src/core/geocode.ts'

/**
 * Recherche par nom de lieu (issue #131).
 *
 * Le premier écran demandait une ref (« GR 20 ») ou un département. Quelqu'un
 * qui débute ne connaît ni l'une ni l'autre : il connaît sa ville. C'est le
 * premier écran, et Sylvie s'y arrêtait.
 *
 * Le géocodeur est l'API Adresse de la BAN (data.gouv.fr, Licence Ouverte),
 * faite pour cet usage — Nominatim interdit le trafic automatisé sans contact
 * déclaré.
 */
const REPONSE_BAN = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [4.387178, 45.439695] },
      properties: {
        label: 'Saint-Étienne',
        city: 'Saint-Étienne',
        context: '42, Loire, Auvergne-Rhône-Alpes',
        type: 'municipality',
        score: 0.97,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [5.0, 45.0] },
      properties: {
        label: 'Saint-Étienne-de-Saint-Geoirs',
        context: '38, Isère, Auvergne-Rhône-Alpes',
        type: 'municipality',
        score: 0.6,
      },
    },
  ],
}

describe('buildGeocodeUrl', () => {
  it('interroge la BAN pour des communes, pas des numéros de rue', () => {
    // « Des balades autour de Saint-Étienne » est une question de commune :
    // sans ce filtre, la réponse est noyée sous les adresses postales.
    const url = new URL(buildGeocodeUrl('Saint-Étienne'))
    expect(url.origin + url.pathname).toBe(
      'https://api-adresse.data.gouv.fr/search/',
    )
    expect(url.searchParams.get('q')).toBe('Saint-Étienne')
    expect(url.searchParams.get('type')).toBe('municipality')
    expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(1)
  })

  it('encode ce que l’utilisateur a tapé, accents et esperluettes compris', () => {
    const url = new URL(buildGeocodeUrl('Nôtre & Dame'))
    expect(url.searchParams.get('q')).toBe('Nôtre & Dame')
  })
})

describe('parseGeocodeResponse', () => {
  it('rend les lieux avec leur position et leur contexte', () => {
    const lieux = parseGeocodeResponse(REPONSE_BAN)
    expect(lieux).toHaveLength(2)
    expect(lieux[0]).toEqual({
      label: 'Saint-Étienne',
      contexte: '42, Loire, Auvergne-Rhône-Alpes',
      center: [4.387178, 45.439695],
    })
  })

  it('garde l’ordre de pertinence du service', () => {
    // La BAN classe par score : on ne re-trie pas ce qu'on ne sait pas mieux
    // classer qu'elle.
    const lieux = parseGeocodeResponse(REPONSE_BAN)
    expect(lieux.map((l) => l.label)).toEqual([
      'Saint-Étienne',
      'Saint-Étienne-de-Saint-Geoirs',
    ])
  })

  it('accepte un lieu sans contexte', () => {
    const lieux = parseGeocodeResponse({
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [4.5, 45.4] },
          properties: { label: 'Quelque part' },
        },
      ],
    })
    expect(lieux[0]?.contexte).toBeNull()
  })

  it('retombe sur le nom quand il n’y a pas de libellé complet', () => {
    const lieux = parseGeocodeResponse({
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [4.5, 45.4] },
          properties: { name: 'Bourg-Argental' },
        },
      ],
    })
    expect(lieux[0]?.label).toBe('Bourg-Argental')
  })

  it('écarte ce qui n’a ni nom ni position exploitable', () => {
    const lieux = parseGeocodeResponse({
      type: 'FeatureCollection',
      features: [
        { geometry: { type: 'Point', coordinates: [4.5, 45.4] }, properties: {} },
        { geometry: null, properties: { label: 'Nulle part' } },
        {
          geometry: { type: 'LineString', coordinates: [[4.5, 45.4]] },
          properties: { label: 'Une ligne' },
        },
        {
          geometry: { type: 'Point', coordinates: ['4.5', '45.4'] },
          properties: { label: 'Texte' },
        },
      ],
    })
    expect(lieux).toEqual([])
  })

  it('rend une liste vide quand le service ne trouve rien', () => {
    expect(
      parseGeocodeResponse({ type: 'FeatureCollection', features: [] }),
    ).toEqual([])
  })

  it('refuse une réponse qui n’a pas la forme attendue', () => {
    // Un portail captif de wifi d'hôtel répond du HTML avec un code 200.
    expect(() => parseGeocodeResponse('<html>Connectez-vous</html>')).toThrow(
      GeocodeError,
    )
    expect(() => parseGeocodeResponse({ erreur: 'quota' })).toThrow(GeocodeError)
  })
})

describe('chercherLieux', () => {
  const reponse = (data: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(data),
    }) as Response

  it('interroge le service et rend les lieux', async () => {
    const appels: string[] = []
    const lieux = await chercherLieux('Saint-Étienne', (url) => {
      appels.push(url instanceof Request ? url.url : url.toString())
      return Promise.resolve(reponse(REPONSE_BAN))
    })
    expect(appels[0]).toContain('api-adresse.data.gouv.fr')
    expect(lieux).toHaveLength(2)
  })

  it('ne part pas en requête pour une saisie vide', async () => {
    let appele = false
    const lieux = await chercherLieux('   ', () => {
      appele = true
      return Promise.resolve(reponse(REPONSE_BAN))
    })
    expect(appele).toBe(false)
    expect(lieux).toEqual([])
  })

  it('dit quoi faire quand le service répond une erreur', async () => {
    await expect(
      chercherLieux('Lyon', () => Promise.resolve(reponse(null, false, 503))),
    ).rejects.toThrow(/recherche de lieu/i)
  })

  it('dit quoi faire quand le réseau ne répond pas', async () => {
    await expect(
      chercherLieux('Lyon', () => Promise.reject(new Error('offline'))),
    ).rejects.toBeInstanceOf(GeocodeError)
  })
})
