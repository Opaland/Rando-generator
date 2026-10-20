// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseGpx } from '../../src/core/gpx.ts'
import { parseTcx } from '../../src/core/tcx.ts'
import { dateAffichee, instantDe, nombreLu } from '../../src/core/valeurLue.ts'

/**
 * Issue #567 — ce qu'un fichier ne dit pas ne doit pas devenir une valeur.
 *
 * `Number('')` et `Number(null)` valent 0 : une balise `<ele></ele>` donnait
 * une altitude de 0 m, et la sonde de la revue (800 / vide / 802 m) un D+ de
 * 802 m au lieu de quelques mètres. Une date illisible, elle, s'affichait
 * « Invalid Date » dans la liste des traces.
 */
const parser = new DOMParser()

function gpx(points: string, metadata = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
${metadata}<trk><trkseg>${points}</trkseg></trk>
</gpx>`
}

function tcx(trackpoints: string, entete = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Hiking">${entete}
    <Lap><Track>${trackpoints}</Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`
}

describe('nombreLu', () => {
  it('rend le nombre écrit', () => {
    expect(nombreLu(' 802.5 ')).toBe(802.5)
    expect(nombreLu('0')).toBe(0)
    expect(nombreLu('-12')).toBe(-12)
  })

  it('ne lit rien dans ce qui est vide, absent ou illisible', () => {
    expect(nombreLu('')).toBeNull()
    expect(nombreLu('   ')).toBeNull()
    expect(nombreLu(null)).toBeNull()
    expect(nombreLu(undefined)).toBeNull()
    expect(nombreLu('nord')).toBeNull()
    expect(nombreLu('Infinity')).toBeNull()
  })
})

describe('la lecture d’un GPX aux balises vides', () => {
  it('une altitude vide est inconnue, pas 0 m', () => {
    const lu = parseGpx(
      gpx(
        `<trkpt lat="45.4" lon="4.5"><ele>800</ele></trkpt>
         <trkpt lat="45.4" lon="4.501"><ele></ele></trkpt>
         <trkpt lat="45.4" lon="4.502"><ele>802</ele></trkpt>`,
      ),
      parser,
    )
    expect(lu.elevations).toEqual([800, null, 802])
  })

  it('un hdop vide est inconnu, pas une précision parfaite', () => {
    const lu = parseGpx(
      gpx(`<trkpt lat="45.4" lon="4.5"><hdop></hdop></trkpt>
           <trkpt lat="45.4" lon="4.501"><hdop>3</hdop></trkpt>`),
      parser,
    )
    expect(lu.hdops).toEqual([null, 3])
  })

  it('un point sans latitude est écarté, pas posé sur l’équateur', () => {
    const lu = parseGpx(
      gpx(`<trkpt lon="4.5"></trkpt>
           <trkpt lat="" lon="4.5"></trkpt>
           <trkpt lat="45.4" lon="4.501"></trkpt>
           <trkpt lat="45.4" lon="4.502"></trkpt>`),
      parser,
    )
    expect(lu.points).toEqual([
      [4.501, 45.4],
      [4.502, 45.4],
    ])
  })
})

describe('la lecture d’un TCX aux balises vides', () => {
  it('une altitude vide est inconnue, une latitude vide écarte le point', () => {
    const lu = parseTcx(
      tcx(`<Trackpoint><Position><LatitudeDegrees>45.4</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position><AltitudeMeters></AltitudeMeters></Trackpoint>
           <Trackpoint><Position><LatitudeDegrees></LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position></Trackpoint>
           <Trackpoint><Position><LatitudeDegrees>45.41</LatitudeDegrees><LongitudeDegrees>4.51</LongitudeDegrees></Position><AltitudeMeters>850</AltitudeMeters></Trackpoint>`),
      parser,
    )
    expect(lu.points).toHaveLength(2)
    expect(lu.elevations).toEqual([null, 850])
  })
})

describe('instantDe', () => {
  it('lit une date ISO', () => {
    expect(instantDe('2026-06-15T08:00:00Z')).toBe(
      Date.UTC(2026, 5, 15, 8, 0, 0),
    )
  })

  it('ne lit rien dans une date illisible, vide ou qui n’est pas un texte', () => {
    expect(instantDe('pas une date')).toBeNull()
    expect(instantDe('')).toBeNull()
    expect(instantDe(null)).toBeNull()
    expect(instantDe(undefined)).toBeNull()
    // Une sauvegarde modifiée à la main : `date: 12345` s'affichait
    // « 01/01/1970 ».
    expect(instantDe(12345)).toBeNull()
  })
})

describe('dateAffichee', () => {
  it('écrit la date à la française', () => {
    expect(dateAffichee('2026-06-15T12:00:00Z')).toBe('15/06/2026')
  })

  it('n’écrit jamais « Invalid Date »', () => {
    expect(dateAffichee('pas une date')).toBeNull()
    expect(dateAffichee(12345)).toBeNull()
  })
})

describe('la date d’une trace importée', () => {
  it('une date de métadonnées illisible laisse la place au premier point', () => {
    const lu = parseGpx(
      gpx(
        `<trkpt lat="45.4" lon="4.5"><time>2026-06-15T08:00:00Z</time></trkpt>`,
        '<metadata><time>pas-une-date</time></metadata>',
      ),
      parser,
    )
    expect(lu.date).toBe('2026-06-15T08:00:00Z')
  })

  it('aucune date lisible : pas de date, plutôt qu’une date fausse', () => {
    const lu = parseGpx(
      gpx(
        `<trkpt lat="45.4" lon="4.5"><time>hier</time></trkpt>`,
        '<metadata><time>pas-une-date</time></metadata>',
      ),
      parser,
    )
    expect(lu.date).toBeNull()
  })

  it('pareil pour le TCX : un <Id> illisible laisse la place au premier point', () => {
    const lu = parseTcx(
      tcx(
        `<Trackpoint><Time>2026-06-15T08:00:00Z</Time><Position><LatitudeDegrees>45.4</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position></Trackpoint>`,
        '<Id>pas-une-date</Id>',
      ),
      parser,
    )
    expect(lu.date).toBe('2026-06-15T08:00:00Z')
  })
})
