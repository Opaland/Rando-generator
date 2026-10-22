import { describe, it, expect } from 'vitest'
import {
  assemblerPourLAppariement,
  segmentsDe,
} from '../../src/core/segmentsDeTrace.ts'
import { trackDistanceMeters } from '../../src/core/history.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { gpxDocumentFromTrack } from '../../src/core/gpxExport.ts'
import { buildTracksGeoJSON } from '../../src/core/mapdata.ts'
import type { LonLat, Track } from '../../src/core/types.ts'

/**
 * Issue #560, sous-point 3 — une trace se coupe là où rien n'a été marché.
 *
 * Une sortie avec une pause était rangée comme une seule ligne : le trajet
 * fait pendant la pause (en voiture, mesuré par la revue : 5 km) se
 * comptait dans l'historique, se dessinait sur la carte et partait dans
 * l'export GPX. L'écran de fin disait 2 km, l'historique 7.
 *
 * `debutsDeSegment` dit où commence chaque tronçon. Absent, la trace est
 * d'un seul tenant — c'est le cas de toutes celles déjà en base.
 */

const est = (i: number): LonLat => [4.8 + i / 1000, 45.75]

function trace(points: LonLat[], debutsDeSegment?: number[]): Track {
  return {
    id: 't',
    filename: 'a.gpx',
    points,
    date: null,
    importedAt: '',
    ...(debutsDeSegment && { debutsDeSegment }),
  }
}

describe('les tronçons d’une trace', () => {
  it('ne coupe rien sans coupure déclarée', () => {
    const points = [est(0), est(1), est(2)]
    expect(segmentsDe(trace(points))).toEqual([points])
  })

  it('coupe là où commence chaque tronçon', () => {
    expect(segmentsDe(trace([est(0), est(1), est(50), est(51)], [2]))).toEqual([
      [est(0), est(1)],
      [est(50), est(51)],
    ])
  })

  /*
    Une sauvegarde peut avoir été modifiée à la main (`core/backup.ts` ne
    revalide que les points) : une coupure à 0, au-delà de la fin, en double
    ou non entière ne doit ni planter ni inventer un tronçon vide.
  */
  it('ignore une coupure absurde', () => {
    const points = [est(0), est(1), est(2), est(3)]
    expect(segmentsDe(trace(points, [0, 4, 2, 2, -1, 1.5, 9]))).toEqual([
      [est(0), est(1)],
      [est(2), est(3)],
    ])
  })
})

describe('la longueur d’une trace', () => {
  it('ne compte pas le trait entre deux tronçons', () => {
    const t = trace([est(0), est(1), est(50), est(51)], [2])
    const attendu =
      distanceMeters(est(0), est(1)) + distanceMeters(est(50), est(51))
    expect(trackDistanceMeters(t)).toBeCloseTo(attendu, 6)
  })
})

describe('l’assemblage pour l’appariement', () => {
  it('ne relie ni deux tronçons, ni deux traces', () => {
    /*
      Les traces sont mises bout à bout pour l'appariement : sans coupure à
      la jonction, la fin d'une sortie de 2023 et le début d'une de 2024 à
      500 m de là se reliaient, et le sentier entre les deux était crédité.
    */
    const a = trace([est(0), est(1)])
    const b = { ...trace([est(5), est(6), est(9)], [2]), times: [1, 2, 3] }
    const assemble = assemblerPourLAppariement([a, b])
    expect(assemble.trackPoints).toHaveLength(5)
    expect(assemble.trackTimes).toEqual([null, null, 1, 2, 3])
    expect(assemble.coupures).toEqual([2, 4])
  })
})

describe('l’export GPX', () => {
  it('écrit un <trkseg> par tronçon', () => {
    const gpx = gpxDocumentFromTrack(
      trace([est(0), est(1), est(50), est(51)], [2]),
    )
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2)
    expect(gpx.match(/<trkpt /g)).toHaveLength(4)
  })

  it('n’en écrit qu’un sans coupure', () => {
    const gpx = gpxDocumentFromTrack(trace([est(0), est(1)]))
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1)
  })
})

describe('la carte', () => {
  it('dessine chaque tronçon à part, sous le même identifiant', () => {
    const { features } = buildTracksGeoJSON([
      trace([est(0), est(1), est(50), est(51)], [2]),
    ])
    expect(features).toHaveLength(2)
    expect(features.map((f) => f.properties.trackId)).toEqual(['t', 't'])
    expect(features[1]?.geometry.coordinates).toEqual([est(50), est(51)])
  })
})
