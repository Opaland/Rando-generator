import { describe, it, expect } from 'vitest'
import { bboxChunks, parsePoiResponse } from '../../src/core/poi.ts'
import {
  buildStages,
  calerSurCouchages,
  couchagesLeLongDuTrace,
  type CouchageSitue,
  type Stage,
} from '../../src/core/stages.ts'
import {
  listerDeclarations,
  type ParcoursDeclare,
} from '../../src/core/declaratif.ts'
import { mentionPoisEmportes } from '../../src/core/poisEmportes.ts'
import type {
  Itinerary,
  LonLat,
  PointOfInterest,
  Sample,
} from '../../src/core/types.ts'
import { STEP_METERS } from '../../src/core/types.ts'

/**
 * Vague de mutation du 23/08 — les survivants qui changent un résultat.
 *
 * `npm run mutation` sur les sept modules touchés dans la journée : score
 * 83,91 %, 111 survivants. La plupart n'apprennent rien — vider une chaîne
 * dans une table de traduction en produit des dizaines, et CLAUDE.md §6bis
 * dit déjà que ce n'est pas ce qu'on cherche.
 *
 * Ce fichier tient ceux qui **changent un résultat**, c'est-à-dire un nombre
 * affiché, un ordre affiché, ou une donnée acceptée. Chacun porte le mutant
 * qui l'a fait naître : c'est la seule façon de savoir, plus tard, ce que le
 * test protège au juste.
 *
 * Aucun n'a révélé un défaut *présent* — le code était juste. Ils révélaient
 * qu'il pouvait cesser de l'être sans que rien ne rougisse, ce qui est le
 * même problème posé un cran plus tôt.
 */

/* ------------------------------------------------------------------ */
/* stages.ts                                                          */
/* ------------------------------------------------------------------ */

function etape(index: number, debut: number, fin: number): Stage {
  return {
    index,
    startMeters: debut,
    endMeters: fin,
    meters: fin - debut,
    doneMeters: 0,
    pct: 0,
    start: [4.5, 45.4],
    end: [4.6, 45.4],
    bounds: [
      [4.5, 45.4],
      [4.6, 45.5],
    ],
  }
}

function couchage(nom: string, metres: number, detour = 100): CouchageSitue {
  return { nom, metresLeLongDuTrace: metres, detourMetres: detour }
}

describe('calerSurCouchages — les longueurs après déplacement', () => {
  /**
   * Mutants survivants : `nouvelleFin - etape.startMeters` devenait
   * `nouvelleFin + etape.startMeters`, et de même pour l'étape suivante.
   *
   * Les bornes étaient assertées, la **longueur** ne l'était pas — or c'est
   * elle qui s'affiche (« Étape 2 · 18,4 km »). C'est exactement la
   * soustraction devenue addition que la première vague avait trouvée dans le
   * calcul de pente, au même endroit d'un même angle mort : on vérifie où la
   * coupure tombe, jamais ce qu'elle laisse de part et d'autre.
   */
  it('recalcule la longueur des deux étapes, pas seulement leurs bornes', () => {
    const cale = calerSurCouchages(
      [etape(1, 0, 20_000), etape(2, 20_000, 40_000)],
      [couchage('Refuge', 18_400)],
      20_000,
    )
    expect(cale[0]?.endMeters).toBe(18_400)
    expect(cale[0]?.meters).toBe(18_400)
    expect(cale[1]?.startMeters).toBe(18_400)
    expect(cale[1]?.meters).toBe(21_600)
    // Et la somme se conserve : rien n'a été inventé ni perdu en chemin.
    expect((cale[0]?.meters ?? 0) + (cale[1]?.meters ?? 0)).toBe(40_000)
  })

  /**
   * Mutants survivants : `<=` devenait `<` sur le départ, `>=` devenait `>`
   * sur l'arrivée de la suivante.
   *
   * Le commentaire du code annonce l'invariant — « la coupure ne doit ni
   * précéder le départ de son étape, ni dépasser l'arrivée de la suivante :
   * sinon l'ordre se casse ». C'était une affirmation sans test
   * (CLAUDE.md §4bis) : un couchage pile au départ produisait une étape de
   * longueur nulle, et personne ne l'aurait vu.
   */
  /**
   * Le mutant a d'abord survécu à ce test-ci, dans sa première forme.
   *
   * Je calais l'étape **1**, dont le départ est zéro : `nouvelleFin + 0` et
   * `nouvelleFin - 0` donnent le même nombre. L'assertion était juste, le cas
   * ne discriminait rien — un test qui ne peut pas échouer, exactement ce que
   * CLAUDE.md §1 décrit, et c'est l'outil qui l'a vu, pas moi. Il faut caler
   * une étape du **milieu** pour que la soustraction compte.
   */
  it('recalcule la longueur d’une étape qui ne part pas de zéro', () => {
    const cale = calerSurCouchages(
      [etape(1, 0, 20_000), etape(2, 20_000, 40_000), etape(3, 40_000, 60_000)],
      [couchage('Refuge du milieu', 38_000)],
      20_000,
    )
    expect(cale[1]?.endMeters).toBe(38_000)
    expect(cale[1]?.startMeters).toBe(20_000)
    expect(cale[1]?.meters).toBe(18_000)
  })

  /**
   * Mutants survivants : `<=` devenait `<` sur le départ, `>=` devenait `>`
   * sur l'arrivée de la suivante.
   *
   * Le commentaire du code annonce l'invariant — « la coupure ne doit ni
   * précéder le départ de son étape, ni dépasser l'arrivée de la suivante :
   * sinon l'ordre se casse ». C'était une affirmation sans test
   * (CLAUDE.md §4bis).
   *
   * Le cas n'est pas artificiel, mais il faut deux tours pour l'atteindre :
   * un couchage à +10 km tire la coupure de l'étape 1 jusqu'à 30 km, ce qui
   * ramène le départ de l'étape 2 exactement là. Au tour suivant, **le même
   * couchage** retombe dans la fenêtre de l'étape 2, et c'est cette garde qui
   * l'écarte. Sans elle, l'étape 2 devient longue de zéro mètre : deux bornes
   * identiques, un pourcentage calculé sur rien, une ligne qui ne veut plus
   * rien dire.
   */
  it('n’écrase pas une étape en y ramenant le couchage de la précédente', () => {
    const cale = calerSurCouchages(
      [etape(1, 0, 20_000), etape(2, 20_000, 40_000), etape(3, 40_000, 60_000)],
      [couchage('Refuge partagé', 30_000)],
      20_000,
    )
    expect(cale[0]?.endMeters).toBe(30_000)
    expect(cale[1]?.startMeters).toBe(30_000)
    // L'étape 2 garde son arrivée : le couchage est derrière elle désormais.
    expect(cale[1]?.endMeters).toBe(40_000)
    expect(cale[1]?.meters).toBe(10_000)
    expect(cale[1]?.couchage).toBeNull()
  })

  /**
   * L'autre moitié de la même garde : `>=` sur l'arrivée de la suivante.
   *
   * Elle n'est atteignable que lorsque la **dernière étape est courte** — le
   * reliquat fusionné de `buildStages`. Une étape de pleine longueur place
   * son arrivée au-delà de la fenêtre, si bien que la comparaison ne se pose
   * jamais ; une queue de 5 km, elle, tombe dedans.
   *
   * C'est la vague de mutation qui a montré le chemin : deux mutants ont
   * survécu à trois tests successifs, et chaque survie disait que le cas
   * n'était pas celui que je croyais avoir écrit.
   */
  it('n’avale pas une dernière étape courte', () => {
    const cale = calerSurCouchages(
      [etape(1, 0, 20_000), etape(2, 20_000, 40_000), etape(3, 40_000, 45_000)],
      [couchage('Gîte du bout', 45_000)],
      20_000,
    )
    expect(cale[1]?.endMeters).toBe(40_000)
    expect(cale[1]?.couchage).toBeNull()
    expect(cale[2]?.startMeters).toBe(40_000)
    expect(cale[2]?.meters).toBe(5_000)
  })
})

function poi(kind: PointOfInterest['kind'], lon: number, lat: number): PointOfInterest {
  return {
    id: `node/${String(lon)}`,
    lon,
    lat,
    kind,
    name: 'Refuge témoin',
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

describe('couchagesLeLongDuTrace — le détour', () => {
  /**
   * Mutant survivant : `meilleureDistance * 2` devenait `meilleureDistance / 2`.
   *
   * Le détour est un **aller-retour** : quatre cents mètres à l'écart du
   * tracé en coûtent huit cents. La division le divisait par quatre et
   * personne ne s'en apercevait — un nombre affiché, faux d'un facteur
   * quatre, et vert.
   */
  it('compte l’aller **et** le retour', () => {
    // Tracé plein est à latitude constante ; le refuge est décalé au nord.
    const trace: LonLat[] = Array.from({ length: 20 }, (_, i) => [
      4.5 + i * 0.01,
      45.4,
    ])
    const [couche] = couchagesLeLongDuTrace([poi('hut', 4.55, 45.404)], trace)
    expect(couche).toBeDefined()
    // ~445 m d'écart à cette latitude : le détour doit être le double.
    const ecart = (couche?.detourMetres ?? 0) / 2
    expect(ecart).toBeGreaterThan(400)
    expect(ecart).toBeLessThan(500)
    expect(couche?.detourMetres).toBeCloseTo(ecart * 2, 6)
  })
})

/** Un degré de latitude ≈ 111 km ; on raisonne en mètres, comme stages.test.ts. */
const LAT = 45.4
const M = 1 / 111_195

function itineraireDroit(metres: number): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways: [
      {
        osmWayId: 10,
        coords: [
          [4.5, LAT],
          [4.5, LAT + metres * M],
        ],
      },
    ],
    totalMeters: metres,
    fetchedAt: '2026-08-23T00:00:00Z',
  } as unknown as Itinerary
}

function echantillons(metres: number): Sample[] {
  const total = Math.floor(metres / STEP_METERS)
  return Array.from({ length: total }, (_, i) => ({
    lon: 4.5,
    lat: LAT + i * STEP_METERS * M,
    wayId: 10,
    itineraryIds: [1],
    done: false,
  }))
}

describe('buildStages — le départ de chaque étape', () => {
  /**
   * Mutant survivant : `startMeters: debut * stepMeters` devenait
   * `debut / stepMeters`.
   *
   * La première étape démarre à zéro dans les deux cas, ce qui suffisait à
   * tromper les tests existants : ils regardaient le départ de celle-là, la
   * longueur des autres, et l'arrivée de la dernière. Le **départ** d'une
   * étape du milieu n'était asserté nulle part — et c'est lui qui s'affiche
   * à gauche de chaque ligne (« 20,0 km → 40,0 km »).
   */
  it('démarre chaque étape là où la précédente s’arrête', () => {
    const etapes = buildStages(itineraireDroit(60_000), echantillons(60_000), {
      stageMeters: 20_000,
    })
    expect(etapes.length).toBeGreaterThan(1)
    for (const [i, e] of etapes.entries()) {
      if (i === 0) continue
      expect(e.startMeters).toBe(etapes[i - 1]?.endMeters)
      expect(e.startMeters).toBeGreaterThan(0)
    }
  })
})

/* ------------------------------------------------------------------ */
/* poi.ts                                                             */
/* ------------------------------------------------------------------ */

describe('parsePoiResponse — ce qui est refusé', () => {
  /**
   * Mutant survivant : `typeof lat !== 'number' || typeof lon !== 'number'`
   * devenait `&&`.
   *
   * Un élément OSM à qui il manque **une** des deux coordonnées passait
   * alors, et produisait un POI dont la longitude est `undefined`. MapLibre
   * en fait un marqueur à `NaN`, c'est-à-dire nulle part, et la liste de la
   * fiche affiche une ligne qu'on ne peut pas atteindre.
   */
  it('écarte un élément à qui il manque une seule coordonnée', () => {
    const sansLon = parsePoiResponse({
      elements: [{ type: 'node', id: 1, lat: 45.4, tags: { natural: 'peak' } }],
    })
    expect(sansLon).toEqual([])

    const sansLat = parsePoiResponse({
      elements: [{ type: 'node', id: 2, lon: 4.5, tags: { natural: 'peak' } }],
    })
    expect(sansLat).toEqual([])
  })

  /**
   * Mutant survivant : `if (pois.has(id)) continue` devenait toujours faux.
   *
   * Overpass renvoie le même nœud deux fois quand deux boîtes englobantes se
   * chevauchent — et elles se chevauchent **par construction**, d'un point,
   * pour ne pas laisser de trou entre deux portions. Le dédoublonnage n'est
   * donc pas une précaution : c'est ce qui empêche un refuge de compter deux
   * fois dans la liste des couchages.
   */
  /**
   * Un survivant reste ici, et il est presque équivalent : `pois` est une
   * `Map` indexée par identifiant, si bien que sans la garde le second
   * exemplaire **écrase** le premier au lieu d'être ignoré. Le compte ne
   * change pas ; seul change lequel des deux gagne, et rien ne permet de
   * préférer l'un. Noté plutôt que testé au forceps.
   */
  it('ne garde qu’une fois un nœud renvoyé deux fois', () => {
    const noeud = {
      type: 'node',
      id: 7,
      lat: 45.4,
      lon: 4.5,
      tags: { tourism: 'alpine_hut', name: 'Refuge doublé' },
    }
    expect(parsePoiResponse({ elements: [noeud, noeud] })).toHaveLength(1)
  })

  /**
   * Mutants survivants : l'ancre `^` disparaissait de `/^https?:\/\//i`.
   *
   * Sans elle, `javascript:alert(1)#https://x` est accepté — la chaîne
   * *contient* bien `https://`. Ce site d'un POI part dans un `href`, et
   * l'ancre est tout ce qui sépare un lien d'un vecteur. Deux mutants
   * survivants au même endroit disaient la même chose : rien ne testait le
   * refus, seulement l'acceptation.
   */
  it('refuse une adresse dont le schéma n’est pas au début', () => {
    const [avecPiege] = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 8,
          lat: 45.4,
          lon: 4.5,
          tags: {
            tourism: 'alpine_hut',
            website: 'javascript:alert(1)#https://exemple.fr',
          },
        },
      ],
    })
    expect(avecPiege?.details.website).toBeNull()
  })

  it('refuse aussi un schéma qui n’est pas http', () => {
    const [ftp] = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 9,
          lat: 45.4,
          lon: 4.5,
          tags: { tourism: 'alpine_hut', website: 'ftp://exemple.fr' },
        },
      ],
    })
    expect(ftp?.details.website).toBeNull()
  })

  /**
   * Mutant survivant : `value.trim() !== ''` devenait toujours vrai.
   *
   * Un tag OSM à espaces — ça existe — devenait un numéro de téléphone vide
   * affiché comme s'il y en avait un. `null` veut dire « pas renseigné » et
   * la fiche saute la ligne ; `' '` veut dire « renseigné », et elle en
   * affiche une vide.
   */
  /**
   * Mutant survivant : `value.trim()` devenait `value` **dans la branche de
   * retour** — pas dans le test. Le tag était bien jugé non vide, puis rendu
   * tel quel, espaces compris.
   *
   * Deux mutants au même endroit disaient deux choses différentes, et un seul
   * était couvert : c'est pourquoi il faut lire les survivants un par un
   * plutôt que de compter les lignes rouges.
   */
  it('rend un tag débarrassé de ses espaces', () => {
    const [avecEspaces] = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 11,
          lat: 45.4,
          lon: 4.5,
          tags: { tourism: 'alpine_hut', phone: '  +33 4 00 00 00 00  ' },
        },
      ],
    })
    expect(avecEspaces?.details.phone).toBe('+33 4 00 00 00 00')
  })

  /**
   * Mutant survivant : `/^https?:\/\//i` devenait `/^https:\/\//i`.
   *
   * Le `?` est ce qui laisse passer `http://`. Beaucoup de refuges de
   * montagne n'ont jamais eu de certificat, et les refuser silencieusement
   * ferait disparaître leur site de la fiche sans que rien ne le dise.
   */
  it('accepte une adresse en http, pas seulement en https', () => {
    const [enClair] = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 12,
          lat: 45.4,
          lon: 4.5,
          tags: { tourism: 'alpine_hut', website: 'http://refuge-exemple.fr' },
        },
      ],
    })
    expect(enClair?.details.website).toBe('http://refuge-exemple.fr')
  })

  it('traite un tag rempli d’espaces comme non renseigné', () => {
    const [muet] = parsePoiResponse({
      elements: [
        {
          type: 'node',
          id: 10,
          lat: 45.4,
          lon: 4.5,
          tags: { tourism: 'alpine_hut', phone: '   ' },
        },
      ],
    })
    expect(muet?.details.phone).toBeNull()
  })
})

describe('bboxChunks — le repli quand le tracé est trop long', () => {
  /**
   * Mutant survivant : `Math.ceil(coords.length / count)` devenait
   * `coords.length * count` dans `evenSlices`.
   *
   * Ce chemin-là ne sert que sur un très long tracé — au-delà de quarante
   * portions, le découpage repart en parts égales. Avec la multiplication,
   * `evenSlices` rend **une seule** part : une boîte englobante unique autour
   * d'un GR de 750 km, c'est-à-dire la requête qu'Overpass refuse et que tout
   * ce découpage existe pour éviter.
   *
   * Aucun test ne franchissait le seuil. Celui-ci le franchit.
   */
  it('reste borné en nombre de boîtes sur un tracé très long', () => {
    // Un demi-degré entre chaque point : chaque pas déborde MAX_SPAN_DEG,
    // donc le découpage naturel dépasse largement les quarante portions.
    const long: LonLat[] = Array.from({ length: 300 }, (_, i) => [
      -4 + i * 0.05,
      45.4,
    ])
    const boites = bboxChunks(long)
    expect(boites.length).toBeGreaterThan(1)
    expect(boites.length).toBeLessThanOrEqual(40)
  })

  it('couvre le tracé entier, du premier au dernier point', () => {
    const long: LonLat[] = Array.from({ length: 300 }, (_, i) => [
      -4 + i * 0.05,
      45.4,
    ])
    const boites = bboxChunks(long)
    const ouest = Math.min(...boites.map((b) => b.west))
    const est = Math.max(...boites.map((b) => b.east))
    expect(ouest).toBeLessThanOrEqual(-4)
    expect(est).toBeGreaterThanOrEqual(-4 + 299 * 0.05)
  })
})

/* ------------------------------------------------------------------ */
/* declaratif.ts                                                      */
/* ------------------------------------------------------------------ */

describe('listerDeclarations — l’ordre affiché', () => {
  /**
   * Quatre mutants survivants dans le comparateur : l'égalité des dates, le
   * `null` de gauche, le `null` de droite, et le sens de la comparaison.
   *
   * C'est l'ordre de « Mes sorties ». Rien ne l'assertait autrement que par
   * un cas à deux éléments datés — le reste du comparateur pouvait dire
   * n'importe quoi.
   *
   * La règle, telle que le code la porte : **du plus récent au plus ancien,
   * et les déclarations sans date à la fin.** Une déclaration sans date n'est
   * pas récente, elle est indatée : la mettre en tête laisserait croire à un
   * parcours d'hier.
   */
  const itineraires = [
    { osmRelationId: 1, ref: 'GR 1', name: 'Un', network: 'GR', totalMeters: 1000 },
    { osmRelationId: 2, ref: 'GR 2', name: 'Deux', network: 'GR', totalMeters: 2000 },
    { osmRelationId: 3, ref: 'GR 3', name: 'Trois', network: 'GR', totalMeters: 3000 },
    { osmRelationId: 4, ref: 'GR 4', name: 'Quatre', network: 'GR', totalMeters: 4000 },
  ] as unknown as Itinerary[]

  function declaree(itineraryId: number, date: string | null): ParcoursDeclare {
    return { itineraryId, date, declareLe: '2026-08-23T10:00:00Z' }
  }

  it('range du plus récent au plus ancien, l’indaté en dernier', () => {
    const listees = listerDeclarations(itineraires, [
      declaree(1, '2026-01-10'),
      declaree(2, null),
      declaree(3, '2026-06-30'),
      declaree(4, '2025-12-01'),
    ])
    expect(listees.map((l) => l.itineraryId)).toEqual([3, 1, 4, 2])
  })

  it('ne fait pas passer une déclaration datée derrière une indatée', () => {
    const listees = listerDeclarations(itineraires, [
      declaree(2, null),
      declaree(1, '2020-01-01'),
    ])
    expect(listees.map((l) => l.itineraryId)).toEqual([1, 2])
  })

  /**
   * Trois survivants restent dans ce comparateur après ces tests, et aucun
   * n'est un défaut — ils sont **équivalents**, c'est-à-dire qu'aucune
   * entrée ne les distingue du code d'origine :
   *
   * - `if (a.date === b.date) return 0` → `false` : le cas retombe sur
   *   `a.date < b.date ? 1 : -1`, qui rend −1 pour deux dates égales. Un
   *   comparateur qui ne rend jamais 0 sur des égaux ne change pas l'ordre
   *   d'un tri ;
   * - `if (b.date === null) return -1` → `false` : retombe sur
   *   `a.date < null`, faux, donc −1. Le même nombre par un autre chemin ;
   * - `a.date < b.date` → `<=` : ne diffère que sur l'égalité, que la
   *   première ligne a déjà interceptée.
   *
   * C'est écrit ici pour qu'on ne les rechasse pas à la prochaine vague. Un
   * survivant n'est pas toujours un trou, et le dire fait partie du travail
   * (CLAUDE.md §6bis).
   */
  it('garde les deux quand les dates sont identiques', () => {
    const listees = listerDeclarations(itineraires, [
      declaree(1, '2026-05-05'),
      declaree(3, '2026-05-05'),
    ])
    expect(listees).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */
/* poisEmportes.ts                                                    */
/* ------------------------------------------------------------------ */

describe('mentionPoisEmportes — les deux conditions', () => {
  /**
   * Mutant survivant : le `||` devenait `&&`.
   *
   * Les deux conditions écartent des cas différents, et les tests n'en
   * couvraient qu'un. Avec le `&&`, une réserve emportée dont la date est
   * inconnue produisait « Emportés le Invalid Date » — une phrase qui dit
   * quelque chose de faux sur la fraîcheur des données, ce que cette mention
   * existe précisément pour éviter.
   */
  it('se tait quand la date de récupération manque', () => {
    expect(
      mentionPoisEmportes(
        { pois: [], source: 'emporte', recuperesLe: null },
        new Date('2026-08-23T12:00:00Z'),
      ),
    ).toBeNull()
  })

  it('se tait quand les points viennent du réseau', () => {
    expect(
      mentionPoisEmportes(
        { pois: [], source: 'reseau', recuperesLe: '2026-08-01T00:00:00Z' },
        new Date('2026-08-23T12:00:00Z'),
      ),
    ).toBeNull()
  })

  it('parle quand les deux sont là', () => {
    const mention = mentionPoisEmportes(
      { pois: [], source: 'emporte', recuperesLe: '2026-08-23T09:00:00Z' },
      new Date('2026-08-23T12:00:00Z'),
    )
    expect(mention).toContain('Emportés')
    expect(mention).not.toContain('Invalid Date')
  })
})
