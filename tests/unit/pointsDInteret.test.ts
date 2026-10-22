import { describe, it, expect } from 'vitest'
import { bboxChunks, buildPoiQuery, fetchPoisOuEchec, parsePoiResponse } from '../../src/core/poi.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Les points d'intérêt, là où la vague de mutation du 19/10 les a trouvés
 * sans test.
 *
 * 34 survivants sur `core/poi.ts`, dont l'essentiel dans le découpage du
 * tracé en boîtes pour Overpass. Une boîte qui en laisse une autre sans
 * chevauchement laisse un point entre les deux — et les refuges qui sont
 * autour ; une boîte trop large fait une requête qui échoue. Les tests
 * vérifiaient le nombre de boîtes, pas ce qu'elles couvrent.
 */

const MARGE = 0.015 // BBOX_MARGIN_DEG

function couvre(box: { south: number; west: number; north: number; east: number }, [lon, lat]: LonLat) {
  return lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north
}

describe('bboxChunks', () => {
  it('ne dépasse pas l’étendue admise sur un aller-retour', () => {
    /*
      0,2° vers l'est, puis retour de 0,3° vers l'ouest, au-delà du départ,
      pour une étendue maximale de 0,25° : une boîte qui oublierait son bord
      est sous-estimerait sa largeur en revenant. Le retour doit passer sous
      le point de départ — avant, le point courant est lui-même le bord, et
      la première version de ce test, qui s'arrêtait avant, ne pouvait pas
      échouer (vu à la seconde vague).
    */
    const trace: LonLat[] = []
    for (let i = 0; i <= 20; i++) trace.push([5 + i * 0.01, 45])
    for (let i = 1; i <= 30; i++) trace.push([5.2 - i * 0.01, 45])
    for (const box of bboxChunks(trace, 0.25)) {
      expect(box.east - box.west).toBeLessThanOrEqual(0.25 + 2 * MARGE + 1e-9)
    }
  })

  it('ne dépasse pas non plus l’étendue admise sur un aller-retour nord-sud', () => {
    const trace: LonLat[] = []
    for (let i = 0; i <= 20; i++) trace.push([5, 45 + i * 0.01])
    for (let i = 1; i <= 30; i++) trace.push([5, 45.2 - i * 0.01])
    for (const box of bboxChunks(trace, 0.25)) {
      expect(box.north - box.south).toBeLessThanOrEqual(0.25 + 2 * MARGE + 1e-9)
    }
  })

  describe('redécoupé en parts égales au-delà du nombre maximal de boîtes', () => {
    // 60 points espacés de 0,1° (plus que la marge), une étendue de 0,05°
    // qui ferait une boîte par point, et au plus 4 boîtes : `evenSlices`.
    const trace = Array.from({ length: 60 }, (_, i): LonLat => [5 + i * 0.1, 45])
    const boites = bboxChunks(trace, 0.05, 4)

    it('couvre chaque point', () => {
      for (const point of trace) {
        expect(boites.some((b) => couvre(b, point)), `point ${String(point)} hors de toute boîte`).toBe(true)
      }
    })

    it('ne fait que des boîtes finies, même quand les parts tombent juste', () => {
      // 60 points en 4 parts de 15 : un multiple exact.
      expect(boites).toHaveLength(4)
      for (const b of boites) {
        expect([b.south, b.west, b.north, b.east].every(Number.isFinite)).toBe(true)
      }
    })

    it('ne fait pas de chaque part le tracé entier', () => {
      expect((boites[0] as { east: number }).east).toBeLessThan(5 + 59 * 0.1)
    })
  })

  it('refuse un tracé vide, avec la phrase exacte', () => {
    expect(() => bboxChunks([])).toThrow('Impossible de calculer une boîte englobante sans point.')
  })
})

describe('buildPoiQuery', () => {
  const requete = buildPoiQuery([[5.7, 45.1]])

  it.each([
    ['l’eau potable', 'nwr["amenity"="drinking_water"]('],
    ['les moulins', 'nwr["man_made"~"^(watermill|windmill)$"]('],
  ])('demande %s', (_quoi, clause) => {
    expect(requete).toContain(clause)
  })

  it('met une clause par ligne, y compris d’une boîte à la suivante', () => {
    expect(requete).toMatch(/\);\n {2}nwr\["natural"~/)
    // Un tracé d'un degré : plusieurs boîtes, donc plusieurs groupes.
    const longue = buildPoiQuery(Array.from({ length: 11 }, (_, i): LonLat => [5 + i * 0.1, 45]))
    expect(longue).toMatch(/windmill\)\$"\]\([^)]*\);\n {2}nwr\["tourism"/)
  })
})

describe('parsePoiResponse', () => {
  const element = (tags: Record<string, string>) => ({ type: 'node', id: 1, lat: 45.1, lon: 5.7, tags })

  it.each([
    [{ tourism: 'picnic_site' }, 'picnic'],
    [{ man_made: 'watermill' }, 'ruins'],
    [{ man_made: 'windmill' }, 'ruins'],
    [{ amenity: 'shelter', shelter_type: 'basic_hut' }, 'bivouac'],
    [{ amenity: 'shelter', shelter_type: 'rock_shelter' }, 'bivouac'],
    [{ historic: 'fort' }, 'ruins'],
    [{ historic: 'tower' }, 'ruins'],
  ])('classe %o en « %s »', (tags, kind) => {
    expect(parsePoiResponse({ elements: [element(tags)] })[0]?.kind).toBe(kind)
  })

  it('lit le téléphone et le site rangés sous « contact: »', () => {
    const [poi] = parsePoiResponse({
      elements: [
        element({ tourism: 'alpine_hut', 'contact:phone': '+33 4 76 00 00 00', 'contact:website': 'https://refuge.example' }),
      ],
    })
    expect(poi?.details.phone).toBe('+33 4 76 00 00 00')
    expect(poi?.details.website).toBe('https://refuge.example')
  })

  it('range d’abord ce qui sert à passer la nuit', () => {
    const elements = [
      { ...element({ historic: 'monument' }), id: 1 },
      { ...element({ tourism: 'picnic_site' }), id: 2 },
      { ...element({ tourism: 'hostel' }), id: 3 },
      { ...element({ tourism: 'alpine_hut' }), id: 4 },
      { ...element({ tourism: 'wilderness_hut' }), id: 5 },
    ]
    expect(parsePoiResponse({ elements }).map((p) => p.kind)).toEqual(['bivouac', 'hut', 'gite', 'picnic', 'monument'])
  })
})

describe('fetchPoisOuEchec', () => {
  it('rend null, et non une liste vide, quand Overpass ne répond pas', async () => {
    // `[]` voudrait dire « il n'y a rien ici » ; `null`, « on n'a pas pu
    // demander ». Les confondre ferait passer une panne pour un désert.
    const resultat = await fetchPoisOuEchec([[5.7, 45.1]], {
      fetchFn: () => Promise.reject(new TypeError('Failed to fetch')),
      mirrors: ['https://exemple.invalid/api/interpreter'],
      timeoutMs: 1_000,
    })
    expect(resultat).toBeNull()
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - les bornes `>` en `>=` de `tooWide` et `chunks.length > maxChunks` :
    égalités exactes de flottants, ou un nombre de boîtes pile au plafond,
    redécoupé en autant de parts — la couverture est la même ;
  - `current.length > 0` forcé à vrai, deux fois : au premier point, une
    étendue nulle n'est jamais trop large ; à la fin, `coords` n'est jamais
    vide (la fonction lève avant) ;
  - le `default` des abris retiré : un abri d'un autre type tombe alors dans
    les cas suivants, qui ne le classent pas non plus — sauf à porter aussi
    une étiquette `historic`, qu'on n'a pas vue ;
  - `'bivouac'` vidé dans l'ordre d'affichage : `indexOf` rend −1, qui trie
    toujours en tête ;
  - `pois.has(id)` forcé à faux : un même élément revenu de deux boîtes porte
    les mêmes données, le garder deux fois dans la `Map` le remplace par
    lui-même.
*/
