import { describe, it, expect } from 'vitest'
import { parseReseauPdipr, jeuPdiprPour } from '../../src/core/pdipr.ts'

/*
  Une emprise de test, et non celle de l'Isère : calculée au chargement du
  fichier, `jeuPdiprPour('isere')!` faisait planter la **collecte** dès
  qu'un mutant cassait `jeuPdiprPour` — et Stryker compte un fichier qui ne
  se charge pas comme un mutant survivant. Une assertion qui ne peut pas
  échouer pour la bonne raison n'en est pas une (§1bis).
*/
const EMPRISE = { ouest: 5, est: 6, sud: 45, nord: 46 }

/**
 * Le PDIPR de l'Isère comme réseau de fond (#87, décision de Cédric du
 * 18/10) : des tronçons sans nom ni ref, affichés tels quels, jamais
 * transformés en itinéraires.
 */
const ligne = (coords: unknown): unknown => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: coords },
})

describe('parseReseauPdipr', () => {
  it('rend chaque tronçon exploitable comme une ligne, sans propriété', () => {
    const reseau = parseReseauPdipr(
      {
        type: 'FeatureCollection',
        features: [
          ligne([
            [5.7, 45.1],
            [5.71, 45.11],
          ]),
        ],
      },
      EMPRISE,
    )
    expect(reseau).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [5.7, 45.1],
              [5.71, 45.11],
            ],
          },
        },
      ],
    })
  })

  it('éclate un MultiLineString en autant de lignes', () => {
    const reseau = parseReseauPdipr({
      features: [
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [5.7, 45.1],
                [5.71, 45.11],
              ],
              [
                [5.8, 45.2],
                [5.81, 45.21],
              ],
            ],
          },
        },
      ],
    }, EMPRISE)
    expect(reseau.features).toHaveLength(2)
    expect(reseau.features[1]?.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [5.8, 45.2],
        [5.81, 45.21],
      ],
    })
  })

  it('écarte une ligne d’un seul point, et une ligne non reprojetée', () => {
    // Un point seul n'a pas de tracé ; des coordonnées Lambert 93 (en mètres)
    // posées telles quelles tomberaient hors du globe, en silence.
    const reseau = parseReseauPdipr({
      features: [
        ligne([[5.7, 45.1]]),
        ligne([
          [915000, 6455000],
          [915100, 6455100],
        ]),
        ligne([
          [5.7, 45.1],
          [5.71, 45.11],
        ]),
      ],
    }, EMPRISE)
    expect(reseau.features).toHaveLength(1)
  })

  it('écarte des coordonnées écrites en chaînes, même dans l’emprise', () => {
    /*
      Trouvé par mutation le 18/10 : sans la vérification des coordonnées,
      `dansEmprise` laissait passer `'5.5' >= 5` — JavaScript compare une
      chaîne à un nombre en la convertissant — et la carte recevait des
      chaînes là où elle attend des nombres.
    */
    const reseau = parseReseauPdipr({
      features: [
        ligne([
          ['5.5', '45.5'],
          ['5.6', '45.6'],
        ]),
        // Un seul point en chaîne suffit : `some` à la place de `every`.
        ligne([
          ['5.5', '45.5'],
          [5.6, 45.6],
        ]),
        ligne([
          [5.5, 45.5],
          [5.6, 45.6],
        ]),
      ],
    }, EMPRISE)
    expect(reseau.features.map((f) => f.geometry.coordinates)).toEqual([
      [
        [5.5, 45.5],
        [5.6, 45.6],
      ],
    ])
  })

  it('écarte un tronçon reprojeté de travers, même en WGS84 valide', () => {
    // Le cas réel du 18/10 : tout Grenoble-Alpes Métropole tombait à
    // 9,9° O, 8,3° N — des coordonnées valides, au large de l'Afrique.
    const reseau = parseReseauPdipr({
      features: [
        ligne([
          [-9.89927, 8.28097],
          [-9.89926, 8.28098],
        ]),
        // Un seul point hors emprise suffit : la ligne entière est fausse.
        ligne([
          [5.7, 45.1],
          [-9.89927, 8.28097],
        ]),
        ligne([
          [5.7, 45.1],
          [5.71, 45.11],
        ]),
      ],
    }, EMPRISE)
    expect(reseau.features).toHaveLength(1)
  })

  it('écarte un tronçon qui sort par n’importe lequel des quatre côtés', () => {
    // Un seul côté vérifié laisserait passer les trois autres en silence.
    for (const dehors of [
      [4.99, 45.5], // ouest
      [6.01, 45.5], // est
      [5.5, 44.99], // sud
      [5.5, 46.01], // nord
    ]) {
      const reseau = parseReseauPdipr(
        { features: [ligne([[5.5, 45.5], dehors])] },
        EMPRISE,
      )
      expect(reseau.features, `point ${String(dehors)}`).toEqual([])
    }
  })

  it('garde un tronçon posé exactement sur le bord de l’emprise', () => {
    // Le bord appartient à l'emprise : un tronçon frontalier n'est pas
    // reprojeté de travers.
    const reseau = parseReseauPdipr(
      {
        features: [
          ligne([
            [5, 45],
            [6, 46],
          ]),
        ],
      },
      EMPRISE,
    )
    expect(reseau.features).toHaveLength(1)
  })

  it('ne lève pas sur un MultiLineString dont les coordonnées ne sont pas une liste', () => {
    expect(
      parseReseauPdipr(
        { features: [{ geometry: { type: 'MultiLineString', coordinates: 42 } }] },
        EMPRISE,
      ).features,
    ).toEqual([])
  })

  it('ne prend pas le contour d’un polygone pour un tronçon', () => {
    // Trouvé par mutation du 18/10 : sans le test du type, l'anneau d'un
    // Polygon — une liste de points, comme une ligne — passait pour un
    // sentier, et la carte aurait peint le pourtour d'une commune.
    const reseau = parseReseauPdipr(
      {
        features: [
          {
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [5.1, 45.1],
                  [5.2, 45.1],
                  [5.2, 45.2],
                  [5.1, 45.1],
                ],
              ],
            },
          },
        ],
      },
      EMPRISE,
    )
    expect(reseau.features).toEqual([])
  })

  /*
    Deux survivants équivalents de la vague du 18/10, écrits pour ne pas
    être rechassés (§6bis) :
    - `coords.every(isWgs84Coordinate)` remplacé par `false` ou `some` : un
      point non numérique ou hors du globe est de toute façon hors de toute
      emprise française, et `dansEmprise` l'écarte juste après. La garde
      reste pour le typage (elle étroit `coords` en `LonLat[]`) ;
    - le `[]` d'une géométrie ni LineString ni MultiLineString, remplacé par
      une liste non vide : ses éléments ne sont pas des listes de points, et
      `enLigne` les écarte un par un.
  */
  it('rend une collection vide plutôt que de lever sur une donnée illisible', () => {
    for (const illisible of [null, 42, 'texte', {}, { features: 'non' }]) {
      expect(parseReseauPdipr(illisible, EMPRISE)).toEqual({
        type: 'FeatureCollection',
        features: [],
      })
    }
    expect(
      parseReseauPdipr(
        { features: [null, { geometry: { type: 'Point' } }] },
        EMPRISE,
      ).features,
    ).toEqual([])
  })
})

describe('jeuPdiprPour', () => {
  it('désigne le jeu de l’Isère pour la zone Isère', () => {
    expect(jeuPdiprPour('isere')?.fichier).toBe('data/pdipr-isere.json')
  })

  it('ne désigne rien pour une zone qu’aucun PDIPR ne couvre', () => {
    expect(jeuPdiprPour('ain')).toBeNull()
    expect(jeuPdiprPour('rhone')).toBeNull()
    expect(jeuPdiprPour(null)).toBeNull()
    // Une clé héritée d'Object.prototype n'est pas une zone.
    expect(jeuPdiprPour('toString')).toBeNull()
  })

  /*
    Survivants équivalents de la vague du 18/10 (§6bis) :
    - `zoneKey === null ||` retiré de `jeuPdiprPour` : `Object.hasOwn`
      convertit `null` en « null », clé absente — la même réponse ;
    - `: []` remplacé par une liste non vide dans `parseReseauPdipr` : ce qui
      n'est ni LineString ni MultiLineString donne alors une ligne qui n'est
      pas un tableau, que `enLigne` écarte — la même réponse.
  */
})
