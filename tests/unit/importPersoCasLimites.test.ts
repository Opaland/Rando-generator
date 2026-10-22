// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * `importCustomGpx` — trois cas trouvés par la vague de mutation du 17/10,
 * aucun couvert par les fichiers existants.
 */

describe('un tracé GeoJSON à plusieurs lignes, certaines trop courtes', () => {
  /*
    `core/geojson.ts:101` écarte déjà toute ligne de moins de deux points
    **avant** que `trancheImport.ts` ne la voie — `trail.lines` n'y arrive
    donc jamais vide ni avec une ligne trop courte. Les gardes de
    `importCustomGpx` sur `trail.lines` (`.some`, le `.filter` avant le
    `.map` qui construit les tronçons) sont donc équivalentes par
    construction : aucun test ne peut les distinguer sans casser cette
    garantie amont, vérifié en injectant leurs trois mutants (`.some` →
    `.every`, le `.filter` supprimé, sa condition toujours vraie) — les
    trois survivent malgré ce test, qui reste utile pour autre chose : il
    couvre le cas réel d'un `MultiLineString` dont une ligne est écartée en
    amont, sans qu'il casse l'import du reste.
  */
  function melange(): File {
    const geo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Sentier mixte' },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [4.8, 45.75],
                [4.8001, 45.75],
              ],
              // Une seule coordonnée : trop courte pour être un tronçon.
              [[4.9, 45.76]],
            ],
          },
        },
      ],
    }
    return new File([JSON.stringify(geo)], 'mixte.geojson', {
      type: 'application/geo+json',
    })
  }

  it('importe le sentier (une ligne valide suffit)', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([melange()])
    expect(etat().importErrors).toEqual([])
    expect(etat().customItineraries).toHaveLength(1)
  })

  it('ne construit un tronçon que pour la ligne gardée en amont', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([melange()])
    const [itineraire] = etat().customItineraries
    expect(itineraire?.ways).toHaveLength(1)
  })
})

describe('un nom de fichier qui porte deux extensions', () => {
  /*
    Trouvé par mutation du 17/10 : sans l'ancre `$`, `.replace(/\.(gpx|…)$/i,
    '')` retire la PREMIÈRE extension rencontrée plutôt que la dernière —
    « releve.gpx.export.geojson » devenait « releve.export.geojson » au lieu
    de « releve.gpx.export ». Aucun nom de fichier existant n'en portait
    deux.
  */
  it('retire l’extension finale, pas la première rencontrée', async () => {
    const geo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [4.8, 45.75],
              [4.8001, 45.75],
            ],
          },
        },
      ],
    }
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([
      new File([JSON.stringify(geo)], 'releve.gpx.export.geojson', {
        type: 'application/geo+json',
      }),
    ])
    expect(etat().customItineraries[0]?.name).toBe('releve.gpx.export')
  })
})

describe('un GPX importé comme tracé perso, avec un point hors limites', () => {
  /*
    `messagePointsHorsLimites` était déjà testé pour lui-même
    (`coordonnees.test.ts`), mais jamais atteint depuis `importCustomGpx` :
    `pointsHorsLimites` n'existe que pour un GPX (`lireItineraires` le fixe
    à 0 pour un GeoJSON), et aucun fichier de ce groupe n'importait de GPX en
    tracé perso avec un point hors limites.
  */
  it('le signale sans empêcher l’import du reste', async () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="45.75" lon="4.8"></trkpt>
    <trkpt lat="200" lon="4.8"></trkpt>
    <trkpt lat="45.76" lon="4.8001"></trkpt>
  </trkseg></trk>
</gpx>`
    const { deps, etat } = espionner()
    await trancheImport(deps).importCustomGpx([
      new File([gpx], 'avec-aberration.gpx', { type: 'application/gpx+xml' }),
    ])
    expect(etat().importErrors).toEqual([
      'avec-aberration.gpx : 1 point hors limites a été ignoré.',
    ])
    expect(etat().customItineraries).toHaveLength(1)
  })
})
