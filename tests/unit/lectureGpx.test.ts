// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { GpxError, parseGpx, trackFingerprint } from '../../src/core/gpx.ts'
import { TcxError, parseTcx } from '../../src/core/tcx.ts'
import type { LonLat } from '../../src/core/types.ts'
import { GPX_MALFORMED } from '../fixtures/gpx.ts'

/**
 * Ce que la vague de mutation du 18/10 sur les lecteurs GPX et TCX a trouvé
 * sans test : les messages de refus, la date d'une trace, et surtout
 * l'empreinte qui décide du doublon.
 *
 * L'empreinte compte plus que le reste. Deux traces différentes qui
 * recevraient la même verraient la seconde refusée comme « déjà
 * importée » ; quatre de ses mutants survivaient, chacun rendant deux
 * traces indiscernables pour peu qu'elles ne diffèrent qu'au bon endroit.
 */

const parser = new DOMParser()

function trace(n: number): LonLat[] {
  return Array.from({ length: n }, (_, i): LonLat => [4.5 + i * 1e-4, 45.4])
}

function sauf(points: LonLat[], indice: number): LonLat[] {
  return points.map((p, i): LonLat => (i === indice ? [p[0], p[1] + 1e-3] : p))
}

describe('trackFingerprint sépare deux traces qui ne diffèrent qu’en un point', () => {
  const base = trace(90)
  it.each([
    ['le premier', 0],
    ['le dernier', 89],
    // Les relevés intermédiaires tombent aux indices ⌊90 i / 9⌋ : 10 … 80.
    ['le premier relevé intermédiaire', 10],
    ['le huitième relevé intermédiaire', 80],
  ])('%s', (_cas, indice) => {
    expect(trackFingerprint(sauf(base, indice))).not.toBe(trackFingerprint(base))
  })

  it('rend la même empreinte au même fichier relu', () => {
    expect(trackFingerprint(trace(90))).toBe(trackFingerprint(trace(90)))
  })
})

describe('parseGpx', () => {
  it('dit « XML invalide » pour un XML tronqué, pas « pas un GPX »', () => {
    expect(() => parseGpx(GPX_MALFORMED, parser)).toThrow(
      new GpxError(
        'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export GPX.',
      ),
    )
  })

  it('dit « XML invalide » quand l’analyseur lui-même lève', () => {
    const casse = {
      parseFromString: () => {
        throw new Error('analyseur indisponible')
      },
    }
    expect(() => parseGpx('<gpx/>', casse as unknown as DOMParser)).toThrow(
      'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export GPX.',
    )
  })

  it('nomme sa racine attendue', () => {
    expect(() => parseGpx('<?xml version="1.0"?><kml/>', parser)).toThrow(
      'Ce fichier n’est pas un GPX (élément racine attendu : <gpx>).',
    )
  })

  const gpx = (corps: string, metadata = '') =>
    `<?xml version="1.0"?><gpx version="1.1">${metadata}<trk><trkseg>${corps}</trkseg></trk></gpx>`
  const pt = (lon: number, time: string) =>
    `<trkpt lat="45.4" lon="${String(lon)}"><time>${time}</time></trkpt>`

  it('date la trace de son premier point, pas du dernier', () => {
    const lu = parseGpx(
      gpx(pt(4.5, '2026-05-01T08:00:00Z') + pt(4.501, '2026-05-01T09:00:00Z')),
      parser,
    )
    expect(lu.date).toBe('2026-05-01T08:00:00Z')
  })

  it('rend une date sans les blancs qui l’entourent', () => {
    // Un export indenté écrit `<time>\n  2026-…\n</time>` : la date se
    // compare et s'affiche, elle ne doit pas garder ses blancs.
    const parPoint = parseGpx(gpx(pt(4.5, '  2026-05-01T08:00:00Z \n') + pt(4.501, '2026-05-01T09:00:00Z')), parser)
    expect(parPoint.date).toBe('2026-05-01T08:00:00Z')
    const parMetadonnees = parseGpx(
      gpx(pt(4.5, '2026-05-01T08:00:00Z') + pt(4.501, '2026-05-01T09:00:00Z'), '<metadata><time> 2026-04-30T07:00:00Z </time></metadata>'),
      parser,
    )
    expect(parMetadonnees.date).toBe('2026-04-30T07:00:00Z')
  })

  it('nomme son erreur', () => {
    expect(new GpxError('x').name).toBe('GpxError')
  })
})

describe('parseTcx', () => {
  const message = 'Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien d’un export TCX.'

  it('dit « XML invalide » pour un XML tronqué, pas « pas un TCX »', () => {
    expect(() => parseTcx('<?xml version="1.0"?><TrainingCenterDatabase><Activities', parser)).toThrow(
      new TcxError(message),
    )
  })

  it('dit « XML invalide » quand l’analyseur lui-même lève', () => {
    const casse = {
      parseFromString: () => {
        throw new Error('analyseur indisponible')
      },
    }
    expect(() => parseTcx('<x/>', casse as unknown as DOMParser)).toThrow(message)
  })

  it('nomme son erreur', () => {
    expect(new TcxError('x').name).toBe('TcxError')
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - les `.trim()` sur `<ele>`, `<hdop>` et les nombres TCX : `Number(' 320 ')`
    vaut 320, le blanc ne change rien ;
  - `releve` qui rend `'∅'` pour un point absent, remplacé par `''` : les deux
    traces comparées le rendent pareil ;
  - `join('|')` → `join('')` : il faudrait qu'un nombre de points collé à
    une coordonnée à six décimales en imite une autre, et que les huit
    relevés suivants coïncident aussi.
*/
