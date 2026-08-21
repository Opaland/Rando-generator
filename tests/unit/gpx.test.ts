// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  parseGpx,
  GpxError,
  elevationGainMeters,
  trackFingerprint,
} from '../../src/core/gpx.ts'
import {
  GPX_SIMPLE,
  GPX_MULTI_SEG,
  GPX_NO_TRKPT,
  GPX_MALFORMED,
  GPX_NOT_GPX,
  GPX_BAD_COORDS,
  GPX_ROUTE_ONLY,
} from '../fixtures/gpx.ts'

const parser = new DOMParser()

describe('parseGpx', () => {
  it('extrait les points [lon, lat] et la date des métadonnées', () => {
    const res = parseGpx(GPX_SIMPLE, parser)
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.5001, 45.4001],
      [4.5002, 45.4002],
    ])
    expect(res.date).toBe('2024-06-15T08:30:00Z')
  })

  it('concatène les points de plusieurs trkseg', () => {
    const res = parseGpx(GPX_MULTI_SEG, parser)
    expect(res.points).toHaveLength(3)
    expect(res.points[2]).toEqual([4.3, 45.3])
  })

  it('prend la date du premier trkpt si les métadonnées n’en ont pas', () => {
    const res = parseGpx(GPX_MULTI_SEG, parser)
    expect(res.date).toBe('2023-11-02T10:00:00Z')
  })

  it('retourne 0 point (sans erreur) pour un GPX sans trkpt', () => {
    const res = parseGpx(GPX_NO_TRKPT, parser)
    expect(res.points).toEqual([])
    expect(res.date).toBeNull()
  })

  it('rejette un XML mal formé avec une GpxError en français', () => {
    expect(() => parseGpx(GPX_MALFORMED, parser)).toThrow(GpxError)
    expect(() => parseGpx(GPX_MALFORMED, parser)).toThrow(/fichier/i)
  })

  it('rejette un XML qui n’est pas un GPX', () => {
    expect(() => parseGpx(GPX_NOT_GPX, parser)).toThrow(GpxError)
  })

  it('ignore les points aux coordonnées non numériques', () => {
    const res = parseGpx(GPX_BAD_COORDS, parser)
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.7, 45.6],
    ])
  })

  it('extrait les altitudes (null quand absentes), alignées sur les points', () => {
    const res = parseGpx(GPX_SIMPLE, parser)
    expect(res.elevations).toEqual([1200, null, null])
  })

  it('lit un parcours <rte><rtept> quand il n’y a pas de <trk> (ex. export Suunto)', () => {
    const res = parseGpx(GPX_ROUTE_ONLY, parser)
    expect(res.points).toEqual([
      [4.68756, 45.505375],
      [4.687533, 45.505382],
      [4.686948, 45.505218],
    ])
    expect(res.elevations).toEqual([449, 449, 445.8])
  })
})

describe('elevationGainMeters', () => {
  it('cumule les montées d’un profil simple', () => {
    // 100 → 150 → 120 → 200 : montées de 50 puis 80.
    expect(elevationGainMeters([100, 150, 120, 200])).toBe(130)
  })

  it('filtre le bruit GPS sous le seuil', () => {
    // Oscillations de ±1 m : aucune montée réelle.
    const noisy = [100, 101, 100, 101, 100, 101, 100]
    expect(elevationGainMeters(noisy)).toBe(0)
  })

  it('retourne null sans données d’altitude exploitables', () => {
    expect(elevationGainMeters([])).toBeNull()
    expect(elevationGainMeters([null, null])).toBeNull()
  })

  it('ignore les trous (null) au milieu du profil', () => {
    expect(elevationGainMeters([100, null, 150])).toBe(50)
  })
})

describe('trackFingerprint', () => {
  it('est identique pour les mêmes points, différente sinon', () => {
    const a: [number, number][] = [
      [4.5, 45.4],
      [4.51, 45.41],
    ]
    const same: [number, number][] = [
      [4.5, 45.4],
      [4.51, 45.41],
    ]
    const other: [number, number][] = [
      [4.5, 45.4],
      [4.52, 45.41],
    ]
    expect(trackFingerprint(a)).toBe(trackFingerprint(same))
    expect(trackFingerprint(a)).not.toBe(trackFingerprint(other))
  })

  it('sépare deux trajets qui partagent leurs extrémités (issue #165)', () => {
    // Même départ, même arrivée, même nombre de points — et deux vallées
    // opposées. L'empreinte ne regardait que les bouts : la seconde sortie
    // était refusée comme un doublon de la première.
    const parLeNord: [number, number][] = [
      [4.5, 45.4],
      [4.55, 45.45],
      [4.6, 45.4],
    ]
    const parLeSud: [number, number][] = [
      [4.5, 45.4],
      [4.55, 45.35],
      [4.6, 45.4],
    ]
    expect(trackFingerprint(parLeNord)).not.toBe(trackFingerprint(parLeSud))
  })

  it('sépare deux boucles qui repartent du même parking', () => {
    // Le cas que le complétiste enchaîne : le parking est aux deux bouts,
    // donc les extrémités sont identiques. Seul le milieu les sépare.
    const versLeNord: [number, number][] = [
      [4.5, 45.4],
      [4.52, 45.42],
      [4.54, 45.46],
      [4.56, 45.5],
      [4.54, 45.46],
      [4.52, 45.42],
      [4.5, 45.4],
    ]
    const versLeSud: [number, number][] = [
      [4.5, 45.4],
      [4.52, 45.38],
      [4.54, 45.34],
      [4.56, 45.3],
      [4.54, 45.34],
      [4.52, 45.38],
      [4.5, 45.4],
    ]
    expect(trackFingerprint(versLeNord)).not.toBe(trackFingerprint(versLeSud))
  })

  it('reconnaît toujours le même fichier importé deux fois', () => {
    const trace: [number, number][] = Array.from({ length: 500 }, (_, i) => [
      4.5 + i * 0.0007,
      45.4 + Math.sin(i / 40) * 0.01,
    ])
    expect(trackFingerprint(trace)).toBe(trackFingerprint([...trace]))
  })

  it('sépare deux longues traces qui ne diffèrent qu’au milieu', () => {
    const base: [number, number][] = Array.from({ length: 500 }, (_, i) => [
      4.5 + i * 0.0007,
      45.4,
    ])
    const detour: [number, number][] = base.map((p, i) =>
      i > 200 && i < 300 ? [p[0], 45.42] : p,
    )
    expect(trackFingerprint(base)).not.toBe(trackFingerprint(detour))
  })

  it('ne bronche pas sur les traces trop courtes pour être échantillonnées', () => {
    expect(trackFingerprint([])).toBe(trackFingerprint([]))
    expect(trackFingerprint([[4.5, 45.4]])).not.toBe(trackFingerprint([]))
    expect(trackFingerprint([[4.5, 45.4]])).toBe(
      trackFingerprint([[4.5, 45.4]]),
    )
  })
})

describe('parseGpx — bornes WGS84 (issue #167)', () => {
  const gpx = (trkpts: string) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  const pt = (lat: string, lon: string, ele?: number) =>
    `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? '' : `<ele>${ele}</ele>`}</trkpt>`

  it('n’accepte pas un point hors du référentiel terrestre', () => {
    // Le cas exact rapporté : lat=95 lon=200 était accepté tel quel.
    const res = parseGpx(gpx(pt('95', '200') + pt('96', '201')), parser)
    expect(res.points).toEqual([])
    expect(res.pointsHorsLimites).toBe(2)
  })

  it('garde les points valides et compte ceux qu’il écarte', () => {
    const res = parseGpx(
      gpx(pt('45.4', '4.5', 800) + pt('95', '200', 900) + pt('45.41', '4.51', 810)),
      parser,
    )
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.51, 45.41],
    ])
    // L'altitude du point écarté part avec lui : les deux tableaux doivent
    // rester alignés, sinon le dénivelé se décale d'un cran.
    expect(res.elevations).toEqual([800, 810])
    expect(res.pointsHorsLimites).toBe(1)
  })

  it('accepte les bornes exactes', () => {
    const res = parseGpx(gpx(pt('90', '180') + pt('-90', '-180')), parser)
    expect(res.points).toEqual([
      [180, 90],
      [-180, -90],
    ])
    expect(res.pointsHorsLimites).toBe(0)
  })

  it('compte aussi les points hors limites d’un parcours <rtept>', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test"><rte>
<rtept lat="45.4" lon="4.5"/><rtept lat="200" lon="95"/>
</rte></gpx>`
    const res = parseGpx(xml, parser)
    expect(res.points).toEqual([[4.5, 45.4]])
    expect(res.pointsHorsLimites).toBe(1)
  })

  it('ne compte pas comme « hors limites » une coordonnée illisible', () => {
    // `lat="nord"` n'est pas un point mal placé, c'est un fichier cassé :
    // le mélanger au compte des points hors bornes rendrait le message faux.
    const res = parseGpx(gpx(pt('nord', '4.5') + pt('45.4', '4.5')), parser)
    expect(res.points).toEqual([[4.5, 45.4]])
    expect(res.pointsHorsLimites).toBe(0)
  })

  it('bascule sur le <rte> même si le <trk> était entièrement hors bornes', () => {
    // Régression introduite par le premier correctif de #167 : le repli sur
    // <rtept> avait été conditionné à « rien n'a été écarté », pour ne pas
    // perdre le compte. Cela troquait des données réelles contre un
    // compteur — le mauvais échange. Les deux comptes s'additionnent.
    const xml = `<?xml version="1.0"?><gpx version="1.1">
<trk><trkseg><trkpt lat="95" lon="200"/></trkseg></trk>
<rte><rtept lat="45.4" lon="4.5"/><rtept lat="45.41" lon="4.51"/><rtept lat="99" lon="4.5"/></rte>
</gpx>`
    const res = parseGpx(xml, parser)
    expect(res.points).toEqual([
      [4.5, 45.4],
      [4.51, 45.41],
    ])
    // Un point écarté dans le trk, un dans le rte.
    expect(res.pointsHorsLimites).toBe(2)
  })

  it('ne compte rien sur un fichier sain', () => {
    expect(parseGpx(GPX_SIMPLE, parser).pointsHorsLimites).toBe(0)
  })
})

describe('horodatage et précision par point (issue #149)', () => {
  const gpx = (trkpts: string) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`

  it('conserve le temps de chaque point, pas seulement du premier', () => {
    // extractPoints lisait <time> uniquement pour dater la trace, puis
    // l'oubliait. C'est la seule information qui distingue une marche d'un
    // trajet en voiture — sans elle, le matching v3 est impossible.
    const res = parseGpx(
      gpx(
        '<trkpt lat="45.4" lon="4.5"><time>2026-06-15T08:00:00Z</time></trkpt>' +
          '<trkpt lat="45.41" lon="4.51"><time>2026-06-15T08:05:00Z</time></trkpt>' +
          '<trkpt lat="45.42" lon="4.52"><time>2026-06-15T08:10:00Z</time></trkpt>',
      ),
      parser,
    )
    expect(res.times).toEqual([
      '2026-06-15T08:00:00Z',
      '2026-06-15T08:05:00Z',
      '2026-06-15T08:10:00Z',
    ])
  })

  it('conserve le hdop de chaque point', () => {
    const res = parseGpx(
      gpx(
        '<trkpt lat="45.4" lon="4.5"><hdop>1.2</hdop></trkpt>' +
          '<trkpt lat="45.41" lon="4.51"><hdop>18</hdop></trkpt>',
      ),
      parser,
    )
    expect(res.hdops).toEqual([1.2, 18])
  })

  it('note l’absence plutôt que d’inventer une valeur', () => {
    // Un GPX exporté d'un logiciel de tracé n'a ni l'un ni l'autre, et
    // reste un itinéraire cible parfaitement valide : les champs ne
    // deviennent pas obligatoires.
    const res = parseGpx(
      gpx('<trkpt lat="45.4" lon="4.5"/><trkpt lat="45.41" lon="4.51"/>'),
      parser,
    )
    expect(res.times).toEqual([null, null])
    expect(res.hdops).toEqual([null, null])
  })

  it('refuse un hdop illisible sans décaler les tableaux', () => {
    const res = parseGpx(
      gpx(
        '<trkpt lat="45.4" lon="4.5"><hdop>bof</hdop></trkpt>' +
          '<trkpt lat="45.41" lon="4.51"><hdop>2</hdop></trkpt>',
      ),
      parser,
    )
    expect(res.hdops).toEqual([null, 2])
  })

  it('garde les tableaux alignés quand un point est écarté', () => {
    // Le piège : un point hors bornes ne doit pas décaler le temps des
    // suivants, sinon la vitesse calculée devient absurde.
    const res = parseGpx(
      gpx(
        '<trkpt lat="45.4" lon="4.5"><time>2026-06-15T08:00:00Z</time></trkpt>' +
          '<trkpt lat="95" lon="200"><time>2026-06-15T08:05:00Z</time></trkpt>' +
          '<trkpt lat="45.42" lon="4.52"><time>2026-06-15T08:10:00Z</time></trkpt>',
      ),
      parser,
    )
    expect(res.points).toHaveLength(2)
    expect(res.times).toEqual([
      '2026-06-15T08:00:00Z',
      '2026-06-15T08:10:00Z',
    ])
    expect(res.times).toHaveLength(res.points.length)
    expect(res.hdops).toHaveLength(res.points.length)
  })

  it('lit aussi les <rtept>', () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1"><rte>
<rtept lat="45.4" lon="4.5"><time>2026-06-15T08:00:00Z</time><hdop>3</hdop></rtept>
<rtept lat="45.41" lon="4.51"/></rte></gpx>`
    const res = parseGpx(xml, parser)
    expect(res.times).toEqual(['2026-06-15T08:00:00Z', null])
    expect(res.hdops).toEqual([3, null])
  })
})
