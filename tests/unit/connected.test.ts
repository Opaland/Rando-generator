import { describe, it, expect } from 'vitest'
import { largestWalkedRun } from '../../src/core/connected.ts'
import type { Itinerary, Sample, TrailWay } from '../../src/core/types.ts'

/**
 * Plus grand enchaînement parcouru d'un seul tenant (issue #91).
 *
 * Le pourcentage dit combien on a fait ; il ne dit pas si on l'a fait d'un
 * seul tenant. « 40 km du GR 7 » et « 40 km du GR 7 d'affilée » ne racontent
 * pas la même sortie.
 */
function way(id: number, points: [number, number][]): TrailWay {
  return { osmWayId: id, coords: points }
}

function itineraire(id: number, ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: id,
    ref: `GR ${id}`,
    name: null,
    network: 'GR',
    ways,
    totalMeters: 0,
    fetchedAt: '2026-08-20T00:00:00Z',
  }
}

/** Un échantillon par tronçon suffit à décrire « parcouru » ou non. */
function echantillons(faits: Record<number, boolean>): Sample[] {
  return Object.entries(faits).map(([wayId, done]) => ({
    lon: 0,
    lat: 0,
    wayId: Number(wayId),
    itineraryIds: [1],
    done,
  }))
}

// Trois tronçons bout à bout, environ 1 km chacun (0,01° de latitude ≈ 1,11 km).
const A = way(1, [
  [4.5, 45.0],
  [4.5, 45.01],
])
const B = way(2, [
  [4.5, 45.01],
  [4.5, 45.02],
])
const C = way(3, [
  [4.5, 45.02],
  [4.5, 45.03],
])
// Un quatrième, ailleurs, qui ne touche personne.
const D = way(4, [
  [5.0, 46.0],
  [5.0, 46.01],
])

describe('largestWalkedRun', () => {
  it('additionne les tronçons parcourus qui se touchent', () => {
    const run = largestWalkedRun(
      [itineraire(1, [A, B, C])],
      echantillons({ 1: true, 2: true, 3: false }),
    )
    expect(run.wayIds).toEqual([1, 2])
    expect(Math.round(run.meters)).toBe(2224)
  })

  it('ne relie pas deux morceaux séparés par un tronçon non parcouru', () => {
    // A et C sont faits, B ne l'est pas : deux morceaux d'un kilomètre, pas
    // un de deux.
    const run = largestWalkedRun(
      [itineraire(1, [A, B, C])],
      echantillons({ 1: true, 2: false, 3: true }),
    )
    expect(run.wayIds).toHaveLength(1)
    expect(Math.round(run.meters)).toBe(1112)
  })

  it('ignore un tronçon parcouru isolé plus court que le meilleur', () => {
    const run = largestWalkedRun(
      [itineraire(1, [A, B, C, D])],
      echantillons({ 1: true, 2: true, 3: false, 4: true }),
    )
    expect(run.wayIds).toEqual([1, 2])
  })

  it('relie des tronçons de deux itinéraires différents qui se rejoignent', () => {
    // Un enchaînement ne s'arrête pas à la frontière d'une relation OSM :
    // sur le terrain, deux GR qui se touchent se marchent à la suite.
    const run = largestWalkedRun(
      [itineraire(1, [A, B]), itineraire(2, [C])],
      echantillons({ 1: true, 2: true, 3: true }),
    )
    expect(run.wayIds).toEqual([1, 2, 3])
  })

  it('ne compte qu’une fois un tronçon partagé par deux itinéraires', () => {
    const run = largestWalkedRun(
      [itineraire(1, [A, B]), itineraire(2, [B, C])],
      echantillons({ 1: true, 2: true, 3: true }),
    )
    expect(run.wayIds).toEqual([1, 2, 3])
    expect(Math.round(run.meters)).toBe(3336)
  })

  it('exige que tout le tronçon soit parcouru, pas seulement un bout', () => {
    // Deux échantillons sur le même way, un seul fait : traverser un sentier
    // n'est pas le parcourir.
    const samples: Sample[] = [
      { lon: 0, lat: 0, wayId: 1, itineraryIds: [1], done: true },
      { lon: 0, lat: 0, wayId: 1, itineraryIds: [1], done: false },
      { lon: 0, lat: 0, wayId: 2, itineraryIds: [1], done: true },
    ]
    const run = largestWalkedRun([itineraire(1, [A, B])], samples)
    expect(run.wayIds).toEqual([2])
  })

  it('ne relie pas un sentier qui en rejoint un autre en son milieu', () => {
    // Hypothèse assumée : OSM découpe les ways aux intersections, et deux
    // tronçons ne se touchent que par leurs extrémités. Un raccord au milieu
    // d'un way passe pour déconnecté — le chiffre est alors plus prudent que
    // la réalité, ce qui est le bon sens de l'erreur.
    const milieu = way(5, [
      [4.5, 45.005],
      [4.6, 45.005],
    ])
    const run = largestWalkedRun(
      [itineraire(1, [A, milieu])],
      echantillons({ 1: true, 5: true }),
    )
    expect(run.wayIds).toEqual([5])
  })

  it('compte une boucle fermée une seule fois', () => {
    // Trois tronçons qui reviennent à leur point de départ : la dernière
    // jonction relie deux extrémités déjà dans la même composante.
    const cote1 = way(10, [
      [4.5, 45.0],
      [4.51, 45.0],
    ])
    const cote2 = way(11, [
      [4.51, 45.0],
      [4.51, 45.01],
    ])
    const cote3 = way(12, [
      [4.51, 45.01],
      [4.5, 45.0],
    ])
    const run = largestWalkedRun(
      [itineraire(1, [cote1, cote2, cote3])],
      echantillons({ 10: true, 11: true, 12: true }),
    )
    expect(run.wayIds).toEqual([10, 11, 12])
    // La somme des trois côtés, sans double compte.
    expect(Math.round(run.meters)).toBe(3260)
  })

  it('rend zéro quand rien n’est parcouru', () => {
    const run = largestWalkedRun(
      [itineraire(1, [A, B])],
      echantillons({ 1: false, 2: false }),
    )
    expect(run.meters).toBe(0)
    expect(run.wayIds).toEqual([])
  })

  it('rend zéro sans itinéraire ni échantillon', () => {
    expect(largestWalkedRun([], []).meters).toBe(0)
  })
})
