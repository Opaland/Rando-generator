// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildGpxDocument, gpxAttributionFor } from '../../src/core/gpxExport.ts'
import { parseGpx } from '../../src/core/gpx.ts'
import { lireItineraires } from '../../src/store/lecture.ts'

/**
 * Issue #557, point 2 — un GPX réimporté perdait son attribution.
 *
 * Sentiers écrit un `<copyright>` dans chaque export d'une donnée ODbL ou en
 * Licence Ouverte ; à la relecture, `gpx.ts` ne le lisait jamais et
 * `lireItineraires` posait `source: null` pour tout GPX. Réimporter un
 * export de Sentiers coupait la chaîne d'attribution, et la fiche disait
 * « Ce fichier ne déclare pas sa source » — faux pour ce fichier-là. Le
 * commentaire qui justifiait ce `null` le disait « relevé soi-même : rien
 * à attribuer » (§4bis), sur l'écran même qui propose d'y déposer un
 * cartoguide ou un Visorando.
 */
const parser = new DOMParser()
const osm = gpxAttributionFor('GR')

function exporte(attribution: typeof osm): string {
  return buildGpxDocument({
    name: 'GR 7',
    coords: [
      [4.5, 45.4],
      [4.501, 45.4],
    ],
    attribution,
    createdAt: '2026-10-20T00:00:00Z',
  })
}

describe('le <copyright> d’un GPX', () => {
  it('est relu', () => {
    expect(parseGpx(exporte(osm), parser).source).toEqual(osm)
  })

  it('est absent quand le fichier n’en porte pas', () => {
    expect(parseGpx(exporte(null), parser).source ?? null).toBeNull()
  })

  it('suit l’itinéraire déposé dans « Mes itinéraires »', async () => {
    const lu = await lireItineraires(new File([exporte(osm)], 'gr7.gpx'))
    expect(lu.source).toEqual(osm)
  })
})
