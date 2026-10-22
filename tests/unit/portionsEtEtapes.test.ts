import { describe, it, expect } from 'vitest'
import { polylineLengthMeters, slicePolyline } from '../../src/core/sampling.ts'
import {
  buildStages,
  calerSurCouchages,
  couchagesLeLongDuTrace,
  type Stage,
} from '../../src/core/stages.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { Itinerary, LonLat, PointOfInterest, Sample } from '../../src/core/types.ts'

/**
 * La portion parcourue d'un chemin, et le découpage en étapes.
 *
 * Écrit après la vague de mutation du 18/10 sur `sampling.ts`, `geo.ts` et
 * `stages.ts` : `geo.ts` est tué en entier, et des 29 survivants des deux
 * autres, neuf changeaient un résultat — dont une boîte d'étape qui pouvait
 * valoir +∞ sans qu'un test le voie, le couchage le plus proche remplacé par
 * le dernier venu, et un aller-retour qui situait le refuge au retour.
 */

const A: LonLat = [4.5, 45.4]
const B: LonLat = [4.51, 45.4]
const C: LonLat = [4.52, 45.41]
const D: LonLat = [4.53, 45.41]

describe('slicePolyline', () => {
  it('découpe un chemin de deux sommets — le cas le plus courant d’OpenStreetMap', () => {
    const total = polylineLengthMeters([A, B])
    const portion = slicePolyline([A, B], total / 4, (3 * total) / 4)
    expect(portion).toHaveLength(2)
  })

  it('ne double pas un sommet répété dans le chemin', () => {
    const coords = [A, B, B, C]
    const portion = slicePolyline(coords, 0, polylineLengthMeters(coords))
    expect(portion).toEqual([A, B, C])
  })

  it('ne double pas le premier point quand le début tombe sur un sommet', () => {
    const coords = [A, B, C, D]
    const auSommetB = distanceMeters(A, B)
    const portion = slicePolyline(coords, auSommetB, polylineLengthMeters(coords))
    expect(portion).toEqual([B, C, D])
  })

  it('ne double pas le dernier point quand la fin tombe sur un sommet', () => {
    const coords = [A, B, C, D]
    const auSommetC = distanceMeters(A, B) + distanceMeters(B, C)
    const portion = slicePolyline(coords, 0, auSommetC)
    expect(portion).toEqual([A, B, C])
  })

  it('place le début au bon endroit quand il tombe dans un segment autre que le premier', () => {
    const coords = [A, B, C]
    const ab = distanceMeters(A, B)
    const bc = distanceMeters(B, C)
    const [premier] = slicePolyline(coords, ab + bc / 2, ab + bc)
    // Le milieu de BC, pas un point décalé de la longueur de AB.
    expect(premier?.[0]).toBeCloseTo((B[0] + C[0]) / 2, 9)
    expect(premier?.[1]).toBeCloseTo((B[1] + C[1]) / 2, 9)
  })
})

/** `n` échantillons le long d'une diagonale, sur un seul chemin. */
function diagonale(n: number): { itineraire: Itinerary; echantillons: Sample[] } {
  const itineraire: Itinerary = {
    osmRelationId: 1,
    ref: null,
    name: 'diagonale',
    network: 'PR',
    ways: [{ osmWayId: 9, coords: [A, [4.5 + n * 1e-3, 45.4 + n * 1e-3]] }],
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
  const echantillons = Array.from({ length: n }, (_, i): Sample => ({
    lon: 4.5 + i * 1e-3,
    lat: 45.4 + i * 1e-3,
    wayId: 9,
    itineraryIds: [1],
    done: false,
  }))
  return { itineraire, echantillons }
}

describe('buildStages', () => {
  it('cadre chaque étape au plus juste, dans les deux dimensions', () => {
    // Le test d'avant ne regardait que la latitude, sur un chemin nord-sud :
    // une borne restée à +∞ y était plus grande que l'autre, donc « juste ».
    const { itineraire, echantillons } = diagonale(10)
    const [etape] = buildStages(itineraire, echantillons, {
      stageMeters: 100_000,
      minStagedMeters: 0,
    })
    expect(etape?.bounds).toEqual([
      [4.5, 45.4],
      [4.5 + 9 * 1e-3, 45.4 + 9 * 1e-3],
    ])
  })

  it('découpe un itinéraire dont la longueur vaut tout juste le minimum', () => {
    const { itineraire, echantillons } = diagonale(25) // 25 × 100 m
    expect(buildStages(itineraire, echantillons, { stageMeters: 1_000, minStagedMeters: 2_500 })).not.toEqual([])
  })

  it('garde en étape un reliquat d’une demi-étape exactement', () => {
    // MERGE_RATIO vaut 0,5 : seul un reliquat *plus court* qu'une demi-étape
    // rejoint la précédente. 25 échantillons, des étapes de 10 : un reliquat
    // de 5 reste une étape à part.
    const { itineraire, echantillons } = diagonale(25)
    const etapes = buildStages(itineraire, echantillons, { stageMeters: 1_000, minStagedMeters: 0 })
    expect(etapes.map((e) => e.meters)).toEqual([1_000, 1_000, 500])
  })
})

function etape(index: number, debut: number, fin: number): Stage {
  return {
    index,
    startMeters: debut,
    endMeters: fin,
    meters: fin - debut,
    doneMeters: 0,
    pct: 0,
    start: A,
    end: B,
    bounds: [A, C],
  }
}

describe('calerSurCouchages', () => {
  it('cale sur le couchage le plus proche de la coupure, pas sur le dernier venu', () => {
    const cale = calerSurCouchages(
      [etape(1, 0, 20_000), etape(2, 20_000, 40_000)],
      [
        { nom: 'Proche', metresLeLongDuTrace: 19_700, detourMetres: 0 },
        { nom: 'Loin', metresLeLongDuTrace: 20_800, detourMetres: 0 },
      ],
      20_000,
    )
    expect(cale[0]?.couchage?.nom).toBe('Proche')
  })
})

describe('couchagesLeLongDuTrace', () => {
  const refuge = (name: string | null, [lon, lat]: LonLat): PointOfInterest => ({
    id: 'node/1',
    lon,
    lat,
    kind: 'hut',
    name,
    details: {},
  } as PointOfInterest)

  it('situe un refuge sur un aller-retour à son premier passage', () => {
    // Le même point est visité à l'aller et au retour : à distance égale,
    // c'est le premier passage qui compte.
    const allerRetour = [A, B, C, B, A]
    const [situe] = couchagesLeLongDuTrace([refuge('Le Refuge', B)], allerRetour)
    expect(situe?.metresLeLongDuTrace).toBeCloseTo(distanceMeters(A, B), 6)
  })

  it('nomme « Couchage » un refuge sans nom', () => {
    const [situe] = couchagesLeLongDuTrace([refuge(null, B)], [A, B, C])
    expect(situe?.nom).toBe('Couchage')
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :

  `sampling.ts`
  - `segLen === 0 → continue` retiré, dans les deux fonctions de découpe :
    `sampleWay` n'entre alors pas dans sa boucle (0 ≥ un pas positif est
    faux) ; `slicePolyline` y gagne un sommet doublé, que le test du sommet
    répété voit — ce survivant-là est tué ;
  - `coords.length < 2` retiré de `slicePolyline` : un seul point a une
    longueur nulle, et `fin <= debut` rend déjà `[]` ;
  - `>=` contre `>` sur `toNext − EPSILON`, `debut <= segDebut`,
    `fin >= segFin` : égalités exactes de flottants, ou interpolation à 0 ou
    à 1 qui rend le sommet lui-même ;
  - `portion.length >= 2` forcé : chaque passage dans la boucle pousse deux
    points à la fois, la portion n'en compte jamais un seul.

  `stages.ts`
  - les échantillons « sans place dans la chaîne » : `chainWays` place tous
    les chemins de deux sommets ou plus, et seuls ceux-là ont des
    échantillons — la boucle de rattrapage ne reçoit jamais rien ;
  - `debut <= ordonnes.length`, `!premier || !dernier`, `meters > 0` : une
    tranche n'est jamais vide dans la boucle telle qu'elle est bornée ;
  - `ecart <= ecartMeilleur` et `d <= meilleureDistance` à égalité exacte —
    le second est tué par l'aller-retour, qui la produit naturellement ; le
    premier demande deux couchages exactement symétriques autour d'une
    coupure.
*/
