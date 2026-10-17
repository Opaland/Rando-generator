// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { TcxError, looksLikeTcx, parseTcx } from '../../src/core/tcx.ts'

/**
 * TCX — troisième format d'export du monde Garmin, après le GPX et le FIT.
 * On le trouve surtout dans les archives anciennes : sans lui, un export
 * Strava d'il y a quelques années perd une partie de ses activités.
 */
const parser = new DOMParser()

function tcx(trackpoints: string, entete = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Hiking">${entete}
    <Lap><Track>${trackpoints}</Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`
}

function point(lat: number, lon: number, options: { ele?: number; time?: string } = {}): string {
  const time = options.time ? `<Time>${options.time}</Time>` : ''
  const ele = options.ele === undefined ? '' : `<AltitudeMeters>${options.ele}</AltitudeMeters>`
  return `<Trackpoint>${time}<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position>${ele}</Trackpoint>`
}

describe('looksLikeTcx', () => {
  it('reconnaît un TCX à sa racine', () => {
    expect(looksLikeTcx(tcx(point(45.4, 4.5)))).toBe(true)
  })

  it('ne prend pas un GPX pour un TCX', () => {
    expect(looksLikeTcx('<?xml version="1.0"?><gpx><trk/></gpx>')).toBe(false)
    expect(looksLikeTcx('rien du tout')).toBe(false)
  })
})

describe('parseTcx', () => {
  it('lit les points, les altitudes et la date', () => {
    const xml = tcx(
      point(45.4, 4.5, { ele: 800, time: '2024-06-15T08:00:00Z' }) +
        point(45.41, 4.51, { ele: 850 }),
    )
    const resultat = parseTcx(xml, parser)
    expect(resultat.points).toEqual([
      [4.5, 45.4],
      [4.51, 45.41],
    ])
    expect(resultat.elevations).toEqual([800, 850])
    expect(resultat.date).toBe('2024-06-15T08:00:00Z')
  })

  it('ignore les trackpoints sans position', () => {
    // Fréquent en début d'activité : la montre horodate avant d'avoir fixé
    // les satellites. Ces points-là n'ont pas de Position.
    const sansPosition =
      '<Trackpoint><Time>2024-06-15T07:59:00Z</Time></Trackpoint>'
    const resultat = parseTcx(tcx(sansPosition + point(45.4, 4.5)), parser)
    expect(resultat.points).toEqual([[4.5, 45.4]])
    // La date du premier point *positionné* : celle d'un point sans position
    // ne dit pas où la sortie a commencé, mais elle dit bien quand.
    expect(resultat.date).toBe('2024-06-15T07:59:00Z')
  })

  it('accepte un point sans altitude', () => {
    const resultat = parseTcx(tcx(point(45.4, 4.5)), parser)
    expect(resultat.elevations).toEqual([null])
  })

  it('aligne les horodatages sur les points, pas seulement les positions', () => {
    // Trouvé par mutation du 17/10 : aucun test ne lisait jamais `.times`.
    const xml = tcx(
      point(45.4, 4.5, { time: '2024-06-15T08:00:00Z' }) +
        point(45.41, 4.51, { time: '2024-06-15T08:05:00Z' }),
    )
    const resultat = parseTcx(xml, parser)
    expect(resultat.times).toEqual([
      Date.parse('2024-06-15T08:00:00Z'),
      Date.parse('2024-06-15T08:05:00Z'),
    ])
  })

  it('garde la date du premier trackpoint, pas celle du dernier qui en porte une', () => {
    /*
      Trouvé par mutation du 17/10 : `premiereDate === null && time` devenu
      `=== null || time` (ou la condition entière rendue toujours vraie)
      survivait, parce qu'un seul des trackpoints de test portait jamais un
      horodatage. Avec deux horodatages réels, une garde affaiblie laisse le
      second écraser le premier.
    */
    const xml = tcx(
      point(45.4, 4.5, { time: '2024-06-15T08:00:00Z' }) +
        point(45.41, 4.51, { time: '2024-06-15T09:30:00Z' }),
    )
    expect(parseTcx(xml, parser).date).toBe('2024-06-15T08:00:00Z')
  })

  it('ne compte pas une position illisible comme hors limites', () => {
    /*
      Trouvé par mutation du 17/10 : remplacer le `||` par un `&&` dans la
      garde `!Number.isFinite(lat) || !Number.isFinite(lon)` laissait un
      point à une seule coordonnée illisible retomber sur la garde
      `estDansLeMonde`, qui le compte comme « hors limites » — une autre
      catégorie, avec un autre message — au lieu de le taire comme illisible.
    */
    const casse =
      '<Trackpoint><Position><LatitudeDegrees>abc</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position></Trackpoint>'
    const resultat = parseTcx(tcx(casse), parser)
    expect(resultat.points).toEqual([])
    expect(resultat.pointsHorsLimites).toBe(0)
  })

  it('élague les espaces d’un identifiant d’activité mis en forme', () => {
    // Trouvé par mutation du 17/10 : un export indenté à la main place du
    // texte avec des espaces autour — `.trim()` sur l'identifiant d'activité
    // n'était jamais mis à l'épreuve d'un tel texte.
    const xml = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity>
    <Id>
      2024-06-15T07:45:00Z
    </Id>
    <Lap><Track>${point(45.4, 4.5)}</Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`
    expect(parseTcx(xml, parser).date).toBe('2024-06-15T07:45:00Z')
  })

  it('élague les espaces d’un horodatage de trackpoint mis en forme', () => {
    /*
      Trouvé par mutation du 17/10 : `.trim()` sur l'heure du trackpoint
      n'était jamais mis à l'épreuve, et `Date.parse` ne tolère pas les
      espaces (`Date.parse('  2024…  ')` rend `NaN`, pas la bonne date) —
      sans l'identifiant d'activité pour masquer le problème, l'heure du
      premier trackpoint sert de date, et doit rester une date valide.
    */
    const xml = tcx('<Trackpoint><Time>\n      2024-06-15T08:00:00Z\n    </Time><Position><LatitudeDegrees>45.4</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position></Trackpoint>')
    const resultat = parseTcx(xml, parser)
    expect(resultat.date).toBe('2024-06-15T08:00:00Z')
    expect(resultat.times).toEqual([Date.parse('2024-06-15T08:00:00Z')])
  })

  it('préfère l’heure d’activité déclarée à celle du premier point', () => {
    const xml = tcx(
      point(45.4, 4.5, { time: '2024-06-15T08:00:00Z' }),
      '<Id>2024-06-15T07:45:00Z</Id>',
    )
    expect(parseTcx(xml, parser).date).toBe('2024-06-15T07:45:00Z')
  })

  it('rassemble les points de plusieurs tours', () => {
    const xml = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity>
    <Lap><Track>${point(45.4, 4.5)}</Track></Lap>
    <Lap><Track>${point(45.41, 4.51)}</Track></Lap>
  </Activity></Activities>
</TrainingCenterDatabase>`
    expect(parseTcx(xml, parser).points).toHaveLength(2)
  })

  it('refuse un XML invalide', () => {
    expect(() => parseTcx('<TrainingCenterDatabase><oups>', parser)).toThrow(
      TcxError,
    )
  })

  it('refuse un fichier qui n’est pas un TCX', () => {
    expect(() => parseTcx('<?xml version="1.0"?><gpx/>', parser)).toThrow(
      /TCX/,
    )
  })

  it('rend zéro point pour un TCX sans trackpoint exploitable', () => {
    // Pas une erreur de lecture : le fichier est valide, il ne contient
    // simplement rien à afficher. L'appelant dira pourquoi.
    expect(parseTcx(tcx(''), parser).points).toEqual([])
  })

  it('ignore une position illisible', () => {
    const casse =
      '<Trackpoint><Position><LatitudeDegrees>abc</LatitudeDegrees><LongitudeDegrees>4.5</LongitudeDegrees></Position></Trackpoint>'
    expect(parseTcx(tcx(casse + point(45.4, 4.5)), parser).points).toEqual([
      [4.5, 45.4],
    ])
  })
})

describe('parseTcx — bornes WGS84 (issue #167)', () => {
  it('écarte et compte les positions hors du référentiel terrestre', () => {
    // Le TCX partageait mot pour mot le trou du GPX (issue #167) : seul
    // `Number.isFinite` filtrait les degrés.
    const res = parseTcx(
      tcx(point(45.4, 4.5, { ele: 800 }) + point(95, 200, { ele: 900 }) + point(45.41, 4.51, { ele: 810 })),
      parser,
    )
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.51, 45.41],
    ])
    expect(res.elevations).toEqual([800, 810])
    expect(res.pointsHorsLimites).toBe(1)
  })

  /*
    Séparés pour la même raison que dans `gpx.test.ts` : réunis, ces deux
    coins forment un pas de 360° de longitude que la projection mesure
    40 000 km, et la garde du domaine (#170) le refuse. La question posée ici
    est celle des bornes WGS84 (#167), pas celle des distances.
  */
  it('accepte la borne nord-est exacte et ne compte rien', () => {
    const res = parseTcx(tcx(point(90, 180)), parser)
    expect(res.points).toEqual([[180, 90]])
    expect(res.pointsHorsLimites).toBe(0)
  })

  it('accepte la borne sud-ouest exacte et ne compte rien', () => {
    const res = parseTcx(tcx(point(-90, -180)), parser)
    expect(res.points).toEqual([[-180, -90]])
    expect(res.pointsHorsLimites).toBe(0)
  })

  /** Issue #170 : le lecteur TCX porte la même garde que le lecteur GPX. */
  it('refuse un tracé qui franchit le méridien 180°', () => {
    expect(() =>
      parseTcx(tcx(point(-17, 179.999) + point(-17, -179.999)), parser),
    ).toThrow(/180/)
  })
})
