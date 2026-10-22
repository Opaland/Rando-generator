import { describe, it, expect } from 'vitest'
import { buildGpxDocument, mentionDeSource } from '../../src/core/gpxExport.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * L'export GPX, octet par octet là où la vague de mutation du 18/10 l'a
 * trouvé sans test.
 *
 * 8 survivants et une ligne jamais exécutée sur `core/gpxExport.ts`. Ce qui
 * compte ici, c'est la forme : une montre refuse sans message un fichier
 * dont l'ordre ou la structure s'écarte du schéma — « le pire des cas sur
 * le terrain », dit le code. Les tests existants cherchaient la présence
 * d'une balise ; aucun ne regardait ce qu'il y avait entre elles.
 */

const A: LonLat = [5.7, 45.1]
const B: LonLat = [5.71, 45.11]
const OPTIONS = { name: 'Boucle', coords: [A, B], attribution: null, createdAt: '2026-10-19T00:00:00.000Z' }

describe('buildGpxDocument', () => {
  it('écrit un point par ligne, sans <time> quand le point n’a pas d’heure', () => {
    const doc = buildGpxDocument({ ...OPTIONS, pointTimes: [null, null] })
    expect(doc).toContain(
      '      <trkpt lat="45.1000000" lon="5.7000000"></trkpt>\n' +
        '      <trkpt lat="45.1100000" lon="5.7100000"></trkpt>',
    )
  })

  it('n’écrit rien entre <name> et la suite quand il n’y a pas d’attribution', () => {
    const doc = buildGpxDocument(OPTIONS)
    expect(doc).not.toContain('copyright')
    expect(doc).toMatch(/<name>Boucle<\/name>\n {4}<time>/)
  })

  it('met chaque repère sur ses lignes, l’un après l’autre', () => {
    const doc = buildGpxDocument({
      ...OPTIONS,
      waypoints: [
        { lon: A[0], lat: A[1], name: 'Étape 1' },
        { lon: B[0], lat: B[1], name: 'Étape 2' },
      ],
    })
    expect(doc).toContain('  </wpt>\n  <wpt lat="45.1100000" lon="5.7100000">')
  })

  it('nomme « Itinéraire » un tracé sans nom', () => {
    expect(buildGpxDocument({ ...OPTIONS, name: '   ' })).toContain('<name>Itinéraire</name>')
  })

  it('refuse un tracé sans point, avec la phrase exacte', () => {
    expect(() => buildGpxDocument({ ...OPTIONS, coords: [] })).toThrow(
      'Impossible d’exporter un itinéraire sans aucun point.',
    )
  })
})

describe('mentionDeSource', () => {
  it('prévient, avec la phrase exacte, qu’un import sans source s’exportera muet', () => {
    const importe: Itinerary = {
      osmRelationId: -1,
      ref: null,
      name: 'Importé',
      network: 'PERSO',
      ways: [{ osmWayId: -1, coords: [A, B] }],
      totalMeters: 1,
      fetchedAt: '2026-10-19T00:00:00.000Z',
      importe: true,
    }
    expect(mentionDeSource(importe)).toBe(
      'Ce fichier ne déclare pas sa source. Si cette donnée vient d’un ' +
        'producteur public, son export GPX ne portera aucune attribution — ' +
        'la plupart des licences ouvertes en exigent une.',
    )
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) : dans `gpxFilename`, `^-+` en `^-`
  et `-+$` en `-$`. Le remplacement qui précède change toute suite de
  caractères interdits en **un seul** tiret : il n'y en a jamais deux à
  retirer en tête ou en queue.
*/
