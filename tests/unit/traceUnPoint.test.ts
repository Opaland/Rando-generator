// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Issue #567, point 3 — un GPX d'un seul point était accepté, « 0 km », sans
 * un mot. Tranché par Cédric le 20/10 : **refusé**, comme le tracé dessiné
 * et l'itinéraire importé, qui demandent déjà deux points.
 */
function gpx(points: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>${points}</trkseg></trk>
</gpx>`
}

describe('une trace d’un seul point', () => {
  it('est refusée, en le disant', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importGpxFiles([
      new File([gpx('<trkpt lat="45.4" lon="4.5"></trkpt>')], 'seul.gpx'),
    ])
    expect(etat().tracks).toHaveLength(0)
    expect(etat().importErrors.join(' ')).toMatch(/seul\.gpx.*deux points/)
  })

  it('deux points suffisent', async () => {
    const { deps, etat } = espionner()
    await trancheImport(deps).importGpxFiles([
      new File(
        [gpx('<trkpt lat="45.4" lon="4.5"></trkpt><trkpt lat="45.4" lon="4.501"></trkpt>')],
        'deux.gpx',
      ),
    ])
    expect(etat().tracks).toHaveLength(1)
  })
})

describe('un <trk> d’un seul point accompagné d’un <rte>', () => {
  /*
    Trouvé par la revue adverse du 21/10 : le repli sur `<rte>` ne jouait que
    sur un `<trk>` **vide**. Un seul `<trkpt>` le court-circuitait, et le refus
    de #567 disait « inexploitable » d'un fichier dont le parcours l'était.
  */
  it('lit le parcours plutôt que de refuser le fichier', async () => {
    const { deps, etat } = espionner()
    const fichier = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg><trkpt lat="45.4" lon="4.5"></trkpt></trkseg></trk>
  <rte>
    <rtept lat="45.4" lon="4.5"></rtept>
    <rtept lat="45.4" lon="4.501"></rtept>
    <rtept lat="45.4" lon="4.502"></rtept>
  </rte>
</gpx>`
    await trancheImport(deps).importGpxFiles([new File([fichier], 'mixte.gpx')])
    expect(etat().importErrors).toEqual([])
    expect(etat().tracks).toHaveLength(1)
    expect(etat().tracks[0]?.points).toHaveLength(3)
  })
})
