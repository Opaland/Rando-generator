// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { lireItineraires, parseTraceFile } from '../../src/store/lecture.ts'
import { buildFit } from '../fixtures/fit.ts'
import { GPX_SIMPLE } from '../fixtures/gpx.ts'

/**
 * Issue #466 — « le format est reconnu au contenu, pas à l'extension ».
 *
 * ## La promesse, et ce qu'elle valait
 *
 * `src/store/lecture.ts` porte cette phrase deux fois :
 *
 * > « Le format est reconnu à la signature du contenu, pas à l'extension :
 * > une montre qui nomme mal son export reste lisible, et un fichier renommé
 * > en `.fit` ne trompe personne. »
 *
 * La vague du 01/09 a mesuré ce qu'elle valait. `lecture.ts` rendait
 * 73,44 %, et parmi les survivants : `if (looksLikeFit(buffer))` mis à
 * `false`, `if (looksLikeTcx(texte))` mis à `false`, et le bloc FIT non
 * couvert du tout. **Aucun test ne faisait passer un FIT ou un TCX par
 * l'aiguillage.**
 *
 * Les analyseurs, eux, sont bien testés — `fit.test.ts`, `tcx.test.ts`. Ce
 * qui ne l'était pas est la partie qui décide **lequel** reçoit le fichier.
 *
 * ## Ce que ça coûte quand ça se trompe
 *
 * Théo exporte depuis sa montre ; le fichier arrive nommé `activity.gpx`
 * alors que c'est un FIT. Un aiguillage à l'extension l'envoie au mauvais
 * analyseur, et il revient « lecture impossible » — un reproche fait au
 * fichier pour un défaut d'aiguillage. Le commentaire promet que non.
 *
 * Le §4bis est explicite : quand une phrase dit « parce que X », X se
 * vérifie, et de préférence par un test.
 *
 * ## Chaque nom de fichier ment, exprès
 *
 * C'est tout l'objet : si l'aiguillage regardait l'extension, chacune de ces
 * questions rougirait.
 */

/** Un FIT minimal mais complet : deux points, signature en tête. */
const FIT = () => buildFit([
  { timestamp: 1, lat: 45.4, lon: 4.5, altitude: 300 },
  { timestamp: 2, lat: 45.401, lon: 4.501, altitude: 310 },
])

/** Un TCX de la même forme que celui de `tcx.test.ts`. */
const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Hiking">
    <Lap><Track>
      <Trackpoint><Position><LatitudeDegrees>45.4</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position><AltitudeMeters>300</AltitudeMeters></Trackpoint>
      <Trackpoint><Position><LatitudeDegrees>45.41</LatitudeDegrees><LongitudeDegrees>4.51</LongitudeDegrees></Position><AltitudeMeters>320</AltitudeMeters></Trackpoint>
    </Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`

describe('parseTraceFile reconnaît le contenu, pas le nom', () => {
  it('lit un FIT que sa montre a nommé « .gpx »', async () => {
    const trace = await parseTraceFile(
      new File([FIT()], 'sortie-du-dimanche.gpx'),
    )
    expect(trace.points).toHaveLength(2)
    // Les altitudes n'existent que dans la lecture FIT : c'est ce qui
    // distingue « lu comme un FIT » de « lu par hasard ».
    expect(trace.elevations).toHaveLength(2)
  })

  it('lit un GPX qu’on a renommé « .fit »', async () => {
    const trace = await parseTraceFile(new File([GPX_SIMPLE], 'trace.fit'))
    expect(trace.points.length).toBeGreaterThan(0)
  })

  it('lit un TCX, que le nom n’annonce pas', async () => {
    const trace = await parseTraceFile(new File([TCX], 'export.gpx'))
    expect(trace.points).toEqual([
      [4.5, 45.4],
      [4.51, 45.41],
    ])
  })
})

describe('lireItineraires reconnaît aussi le contenu', () => {
  it('lit un FIT déposé dans « Mes itinéraires »', async () => {
    /*
      Ce chemin n'était **pas couvert du tout** : aucun test ne faisait
      entrer un FIT par `lireItineraires`.

      En revanche, le survivant `if (!looksLikeFit(buffer))` → `true` **en
      est vraiment un**, et cette question ne le tue pas : mesuré, la garde
      mise à `true` laisse les quatre tests verts. La raison est que les
      octets d'un FIT décodés en texte ne ressemblent à aucun GeoJSON, donc
      `looksLikeGeoJson` répond non et le fichier retombe sur
      `parseTraceFile` de toute façon.

      La garde n'est donc pas une garde de résultat mais d'économie : elle
      évite d'allouer une chaîne de plusieurs mégaoctets pour un buffer
      binaire. Un mutant équivalent quant au résultat, écrit ici pour qu'on
      ne le rechasse pas à la vague suivante (§6bis).
    */
    const lu = await lireItineraires(new File([FIT()], 'boucle.geojson'))
    expect(lu.trails).toHaveLength(1)
    expect(lu.trails[0]?.lines[0]).toHaveLength(2)
    expect(lu.source).toBeNull()
  })
})
