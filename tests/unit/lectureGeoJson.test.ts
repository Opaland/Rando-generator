import { describe, it, expect } from 'vitest'
import {
  GeoJsonError,
  looksLikeGeoJson,
  parseGeoJsonTrails,
  sourceDeclaree,
} from '../../src/core/geojson.ts'

/**
 * Le lecteur GeoJSON devant un fichier abîmé.
 *
 * Écrit après la vague de mutation du 18/10 : 51 survivants sur
 * `core/geojson.ts`, presque tous sur des entrées que les tests ne posaient
 * pas — un `null` dans une ligne, une géométrie nulle, un polygone, un nom
 * fait d'espaces, une coordonnée en chaîne. Un GeoJSON vient du disque, et
 * souvent d'un export open data qu'on n'a pas écrit soi-même.
 *
 * La règle partout : ce qui est abîmé est écarté, et le reste du fichier
 * est lu. Seule une projection métrique fait échouer le fichier entier,
 * parce qu'elle se corrige à la source (#87).
 */

const BON: [number, number][] = [
  [5.7, 45.1],
  [5.71, 45.11],
]

function feature(geometry: unknown, properties: unknown = { nom: 'Sain' }): unknown {
  return { type: 'Feature', properties, geometry }
}

const ligne = (coordinates: unknown) => feature({ type: 'LineString', coordinates })

function lire(...features: unknown[]) {
  return parseGeoJsonTrails({ type: 'FeatureCollection', features })
}

const PROJETEE =
  'Ce fichier semble être projeté (Lambert 93 ou similaire) et non en ' +
  'coordonnées géographiques. Reprojetez-le en WGS84 (EPSG:4326) ' +
  'avant de l’importer.'

describe('ce qui est abîmé est écarté, le reste est lu', () => {
  it.each([
    ['une géométrie nulle', feature(null)],
    ['une ligne qui contient null', ligne([BON[0], null])],
    ['une ligne avec un point en chaînes', ligne([BON[0], ['5.71', '45.11']])],
    ['une longitude en chaîne au-delà de 180', ligne([BON[0], ['915000', 45.1]])],
    ['une latitude en chaîne au-delà de 90', ligne([BON[0], [5.71, '6455000']])],
    ['un MultiLineString sans coordonnées', feature({ type: 'MultiLineString', coordinates: null })],
    ['un MultiLineString dont un tronçon est un nombre', feature({ type: 'MultiLineString', coordinates: [5] })],
    [
      'un polygone',
      feature({ type: 'Polygon', coordinates: [[BON[0], BON[1], [5.72, 45.1], BON[0]]] }),
    ],
  ])('%s', (_cas, abime) => {
    const lus = lire(abime, ligne(BON))
    expect(lus).toEqual([{ name: 'Sain', lines: [BON] }])
  })
})

describe('une projection métrique fait échouer le fichier, avec la phrase qui dit quoi faire', () => {
  it.each([
    ['un seul point projeté parmi des bons', [BON[0], [915000, 6455000]]],
    ['une latitude seule hors bornes', [BON[0], [5.7, 6455000]]],
    ['une longitude seule hors bornes', [BON[0], [915000, 45.1]]],
  ])('%s', (_cas, coordonnees) => {
    expect(() => lire(ligne(coordonnees))).toThrow(new GeoJsonError(PROJETEE))
  })

  it('mais pas une coordonnée posée sur la borne', () => {
    // 180° et 90° sont des coordonnées WGS84 valides, pas une projection.
    expect(() => lire(ligne([[179.9, 45], [180, 45]]))).not.toThrow()
    expect(() => lire(ligne([[5, 89.9], [5, 90]]))).not.toThrow()
  })
})

describe('les noms', () => {
  it.each(['libellé', 'intitulé', 'label', 'denomination', 'dénomination'])(
    'lit l’intitulé « %s »',
    (cle) => {
      expect(lire(feature({ type: 'LineString', coordinates: BON }, { [cle]: 'Le Sentier' }))[0]?.name).toBe(
        'Le Sentier',
      )
    },
  )

  it('rend un nom sans ses blancs', () => {
    expect(lire(feature({ type: 'LineString', coordinates: BON }, { nom: '  Le Sentier  ' }))[0]?.name).toBe(
      'Le Sentier',
    )
  })

  it('passe à l’intitulé suivant quand le premier est vide ou n’est pas un texte', () => {
    const blanc = feature({ type: 'LineString', coordinates: BON }, { nom: '   ', name: 'Second' })
    const nombre = feature({ type: 'LineString', coordinates: BON }, { nom: 42, name: 'Second' })
    expect(lire(blanc)[0]?.name).toBe('Second')
    expect(lire(nombre)[0]?.name).toBe('Second')
  })
})

describe('la racine', () => {
  it('lit un MultiLineString nu', () => {
    expect(parseGeoJsonTrails({ type: 'MultiLineString', coordinates: [BON] })).toEqual([
      { name: null, lines: [BON] },
    ])
  })

  it.each([
    ['un nombre', 42, 'Ce fichier n’est pas un GeoJSON.'],
    ['null', null, 'Ce fichier n’est pas un GeoJSON.'],
    [
      'un objet d’un autre type',
      { type: 'Polygon', coordinates: [] },
      'Ce fichier n’est pas un GeoJSON de sentiers (ni FeatureCollection, ni Feature, ni géométrie).',
    ],
  ])('refuse %s, avec la phrase exacte', (_cas, donnee, message) => {
    expect(() => parseGeoJsonTrails(donnee)).toThrow(new GeoJsonError(message))
  })

  it('nomme son erreur', () => {
    expect(new GeoJsonError('x').name).toBe('GeoJsonError')
  })
})

describe('looksLikeGeoJson', () => {
  it.each([
    ['une Feature seule', '{"type":"Feature","geometry":null}'],
    ['une LineString nue', '{"type":"LineString","coordinates":[]}'],
    ['un MultiLineString nu', '{"type":"MultiLineString","coordinates":[]}'],
  ])('reconnaît %s', (_cas, texte) => {
    expect(looksLikeGeoJson(texte)).toBe(true)
  })

  it.each([
    ['le mot « Feature » sans « type »', '{"Feature": 1}'],
    ['un « type » qui n’est pas une géométrie de sentier', '{"type":"Polygon"}'],
  ])('ne reconnaît pas %s', (_cas, texte) => {
    expect(looksLikeGeoJson(texte)).toBe(false)
  })
})

describe('sourceDeclaree', () => {
  it.each([null, 'texte', 42])('rend null pour %s', (donnee) => {
    expect(sourceDeclaree(donnee)).toBeNull()
  })

  it('rend le producteur sans ses blancs, et une licence vide plutôt qu’absente', () => {
    expect(sourceDeclaree({ attribution: '  Département de l’Isère  ' })).toEqual({
      author: 'Département de l’Isère',
      license: '',
    })
  })

  it('lit la licence écrite à la française, et passe une licence blanche', () => {
    // L'attribution de la Licence Ouverte (#87) porte le nom de la licence :
    // c'est la valeur qui compte, pas seulement la présence d'un producteur.
    expect(sourceDeclaree({ source: 'Le Département', licence: 'Licence Ouverte 2.0' })).toEqual({
      author: 'Le Département',
      license: 'Licence Ouverte 2.0',
    })
    expect(
      sourceDeclaree({ source: 'Le Département', license: '   ', licence: 'Licence Ouverte 2.0' }),
    ).toEqual({ author: 'Le Département', license: 'Licence Ouverte 2.0' })
    expect(
      sourceDeclaree({ source: 'Le Département', license: '', licence: 'Licence Ouverte 2.0' }),
    ).toEqual({ author: 'Le Département', license: 'Licence Ouverte 2.0' })
  })

  it('ne prend pas un nombre pour un producteur', () => {
    expect(sourceDeclaree({ attribution: 42, source: 'Le Département' })).toEqual({
      author: 'Le Département',
      license: '',
    })
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `text.slice(0, 4096)` remplacé par `text` dans `looksLikeGeoJson` : ne
    diffère que pour un fichier dont `"type"` arrive après 4 096 caractères.
    L'étendre serait un choix (lire plus loin pour flairer), pas un défaut ;
  - dans `sourceDeclaree`, `typeof data !== 'object'` retiré de la garde :
    un texte ou un nombre indexé rend `undefined`, donc le même `null` ;
  - `: []` remplacé par une liste non vide pour une géométrie d'un autre
    type, et `'Feature'` vidé dans la Feature reconstruite d'une géométrie
    nue : la liste ne contient alors que des non-tableaux, que la boucle
    écarte, et le `type` de la Feature n'est jamais relu.
*/
