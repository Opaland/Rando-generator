// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseGpx } from '../../src/core/gpx.ts'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { trackDistanceMeters } from '../../src/core/history.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Issue #560, second commit — un GPX à plusieurs `<trkseg>` gardait ses
 * coupures à la lecture.
 *
 * Le schéma GPX 1.1 dit qu'un `<trkseg>` est « une suite continue de
 * points » : une montre en ouvre un nouveau après une pause ou une perte
 * de signal. La lecture mettait tous les points bout à bout, et la trace
 * importée avait le défaut que la trace enregistrée vient de perdre : le
 * trajet entre deux segments compté, dessiné, apparié.
 */

function trkpt(lon: number, ele: number | null = null): string {
  const e = ele === null ? '' : `<ele>${String(ele)}</ele>`
  return `<trkpt lat="45.4000" lon="${lon.toFixed(4)}">${e}</trkpt>`
}

function gpx(corps: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
${corps}
</gpx>`
}

const parser = new DOMParser()

describe('la lecture d’un GPX en plusieurs segments', () => {
  it('ne coupe rien dans un segment unique', () => {
    const lu = parseGpx(
      gpx(`<trk><trkseg>${trkpt(4.5)}${trkpt(4.501)}</trkseg></trk>`),
      parser,
    )
    expect(lu.debutsDeSegment).toEqual([])
  })

  it('coupe à chaque nouveau <trkseg>', () => {
    const lu = parseGpx(
      gpx(`<trk>
        <trkseg>${trkpt(4.5)}${trkpt(4.501)}</trkseg>
        <trkseg>${trkpt(4.55)}${trkpt(4.551)}${trkpt(4.552)}</trkseg>
        <trkseg>${trkpt(4.6)}${trkpt(4.601)}</trkseg>
      </trk>`),
      parser,
    )
    expect(lu.points).toHaveLength(7)
    expect(lu.debutsDeSegment).toEqual([2, 5])
  })

  it('coupe aussi entre deux <trk>', () => {
    const lu = parseGpx(
      gpx(`<trk><trkseg>${trkpt(4.5)}${trkpt(4.501)}</trkseg></trk>
           <trk><trkseg>${trkpt(4.55)}${trkpt(4.551)}</trkseg></trk>`),
      parser,
    )
    expect(lu.debutsDeSegment).toEqual([2])
  })

  /*
    Un point écarté (hors du monde, coordonnée illisible) ne doit pas
    décaler la coupure : elle se pose au premier point **gardé** du
    nouveau segment.
  */
  it('pose la coupure au premier point gardé du segment', () => {
    const lu = parseGpx(
      gpx(`<trk>
        <trkseg>${trkpt(4.5)}${trkpt(4.501)}</trkseg>
        <trkseg><trkpt lat="nord" lon="4.55"></trkpt>${trkpt(4.551)}${trkpt(4.552)}</trkseg>
      </trk>`),
      parser,
    )
    expect(lu.points).toHaveLength(4)
    expect(lu.debutsDeSegment).toEqual([2])
  })

  it('ne coupe pas pour un segment dont aucun point n’est gardé', () => {
    const lu = parseGpx(
      gpx(`<trk>
        <trkseg>${trkpt(4.5)}${trkpt(4.501)}</trkseg>
        <trkseg><trkpt lat="nord" lon="4.55"></trkpt></trkseg>
        <trkseg>${trkpt(4.6)}${trkpt(4.601)}</trkseg>
      </trk>`),
      parser,
    )
    expect(lu.debutsDeSegment).toEqual([2])
  })
})

describe('l’import d’un GPX en plusieurs segments', () => {
  it('range la trace avec ses coupures, et sans le trajet entre elles', async () => {
    const { deps, etat } = espionner()
    const fichier = gpx(`<trk>
      <trkseg>${trkpt(4.5, 200)}${trkpt(4.501, 210)}</trkseg>
      <trkseg>${trkpt(4.55, 900)}${trkpt(4.551, 910)}</trkseg>
    </trk>`)
    await trancheImport(deps).importGpxFiles([new File([fichier], 'a.gpx')])

    const [trace] = etat().tracks
    expect(trace?.debutsDeSegment).toEqual([2])
    // ~78 m par segment, et pas les ~3,8 km entre les deux.
    expect(trackDistanceMeters(trace ?? etat().tracks[0]!)).toBeLessThan(200)
    // Et pas les 690 m de montée en voiture entre les deux segments : le
    // dénivelé se compte tronçon par tronçon, comme pour une sortie
    // enregistrée. Deux montées de 10 m, sous l'hystérésis : zéro.
    expect(trace?.elevationGain ?? null).not.toBeGreaterThan(20)
  })
})
