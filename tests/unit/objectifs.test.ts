import { describe, it, expect } from 'vitest'
import {
  MAX_TRONCONS,
  tronconsRestants,
  resumeObjectif,
} from '../../src/core/objectifs.ts'
import type { Itinerary, Sample } from '../../src/core/types.ts'

/**
 * Mode « objectif » (issue #13).
 *
 * Le tableau de bord constate ; il ne motive pas. « 43 % » laisse devant une
 * carte et cinquante itinéraires entamés. Épingler un itinéraire, c'est
 * répondre à la seule question qui reste : *qu'est-ce qu'il me manque, et
 * où ?*
 */
const GR7: Itinerary = {
  osmRelationId: 1,
  ref: 'GR 7',
  name: null,
  network: 'GR',
  ways: [{ osmWayId: 10, coords: [[4.5, 45.4], [4.6, 45.4]] }],
  totalMeters: 8_000,
  fetchedAt: '2026-08-20T00:00:00Z',
}

/** Échantillons du way 10, alignés, avec le motif de complétion donné. */
function echantillons(motif: boolean[], wayId = 10): Sample[] {
  return motif.map((done, i) => ({
    lon: 4.5 + i * 0.01,
    lat: 45.4,
    wayId,
    itineraryIds: [1],
    done,
  }))
}

describe('tronconsRestants', () => {
  it('rend les tronçons non parcourus, du plus long au plus court', () => {
    // ██░░░░██░░██ : deux trous, l'un de 4 pas, l'autre de 2.
    const samples = echantillons([
      true, true,
      false, false, false, false,
      true, true,
      false, false,
      true, true,
    ])
    const troncons = tronconsRestants(GR7, samples, 100)
    expect(troncons).toHaveLength(2)
    /*
      Trouvé par mutation du 17/10 : `+=` remplacé par `-=` rendait des
      longueurs négatives, et l'assertion `toBeGreaterThan` passait encore —
      0 > -200 autant que 400 > 200. Il faut la vraie valeur, pas seulement
      l'ordre relatif.
    */
    expect(troncons[0]?.meters).toBe(400)
    expect(troncons[1]?.meters).toBe(200)
  })

  it('trie par longueur décroissante, pas par ordre de rencontre', () => {
    /*
      Trouvé par mutation du 17/10 : `.sort((a, b) => b.meters - a.meters)`
      remplacé par `() => undefined`, ou par une addition, ou supprimé pur
      et simple, survivait à tous les tests existants, qui ne construisaient
      jamais un cas où l'ordre de tri diffère de l'ordre de rencontre.
    */
    const samples = echantillons([
      false, false, // 1er tronçon rencontré : 2 pas.
      true,
      false, false, false, false, false, false, // 2e : 6 pas, le plus long.
      true,
      false, false, false, false, // 3e : 4 pas.
    ])
    const troncons = tronconsRestants(GR7, samples, 100)
    expect(troncons.map((t) => t.meters)).toEqual([600, 400, 200])
  })

  it('donne le point où l’on reprend, et celui où l’on s’arrête', () => {
    const samples = echantillons([true, false, false, true])
    const [troncon] = tronconsRestants(GR7, samples, 100)
    // Le premier point non parcouru : c'est là qu'on se gare.
    expect(troncon?.start[0]).toBeCloseTo(4.51, 5)
    expect(troncon?.end[0]).toBeCloseTo(4.52, 5)
  })

  it('ne rend rien quand tout est parcouru', () => {
    expect(tronconsRestants(GR7, echantillons([true, true, true]), 100)).toEqual(
      [],
    )
  })

  it('rend un seul tronçon quand rien n’est parcouru', () => {
    const troncons = tronconsRestants(GR7, echantillons([false, false, false]), 100)
    expect(troncons).toHaveLength(1)
  })

  it('ne coud pas ensemble deux chemins différents', () => {
    // Deux ways non parcourus se suivent dans la liste : ce sont deux
    // tronçons, pas un seul — les recoller ferait promettre une continuité
    // que la géométrie ne garantit pas.
    const samples = [
      ...echantillons([false, false], 10),
      ...echantillons([false, false], 11),
    ]
    const itin: Itinerary = {
      ...GR7,
      ways: [
        { osmWayId: 10, coords: [[4.5, 45.4], [4.51, 45.4]] },
        { osmWayId: 11, coords: [[4.7, 45.4], [4.71, 45.4]] },
      ],
    }
    expect(tronconsRestants(itin, samples, 100)).toHaveLength(2)
  })

  it('ignore les échantillons des autres itinéraires', () => {
    const samples: Sample[] = [
      ...echantillons([false, false]),
      { lon: 9, lat: 45, wayId: 99, itineraryIds: [2], done: false },
    ]
    const troncons = tronconsRestants(GR7, samples, 100)
    expect(troncons).toHaveLength(1)
    expect(troncons[0]?.wayId).toBe(10)
  })

  it('ne rend jamais plus de tronçons qu’on ne peut en lire', () => {
    // Un GR de 800 km entamé par morceaux en produirait des centaines : la
    // liste deviendrait le problème qu'elle prétend résoudre.
    const motif = Array.from({ length: 400 }, (_, i) => i % 2 === 0)
    expect(tronconsRestants(GR7, echantillons(motif), 100).length).toBe(
      MAX_TRONCONS,
    )
  })
})

describe('resumeObjectif', () => {
  it('dit ce qui reste, en mètres et en tronçons', () => {
    const samples = echantillons([true, true, false, false, true])
    const resume = resumeObjectif(GR7, samples, 100)
    expect(resume.remainingMeters).toBeCloseTo(200, 0)
    expect(resume.troncons).toHaveLength(1)
    expect(resume.pct).toBeCloseTo(60, 0)
    // Trouvé par mutation du 17/10 : `faits * stepMeters` devenu
    // `faits / stepMeters` ne cassait aucun test, parce qu'aucun ne lisait
    // `doneMeters`.
    expect(resume.doneMeters).toBeCloseTo(300, 0)
  })

  it('ignore les échantillons des autres itinéraires dans son propre calcul', () => {
    /*
      Trouvé par mutation du 17/10 : `samples.filter((s) =>
      s.itineraryIds.includes(...))` remplacé par `samples` (filtre
      supprimé) survivait, parce qu'aucun test ne mélangeait les échantillons
      d'un autre itinéraire dans l'appel à `resumeObjectif`.
    */
    const samples: Sample[] = [
      ...echantillons([true, false]),
      { lon: 9, lat: 45, wayId: 99, itineraryIds: [2], done: false },
      { lon: 9.01, lat: 45, wayId: 99, itineraryIds: [2], done: false },
      { lon: 9.02, lat: 45, wayId: 99, itineraryIds: [2], done: false },
    ]
    const resume = resumeObjectif(GR7, samples, 100)
    expect(resume.pct).toBeCloseTo(50, 0)
    expect(resume.doneMeters).toBeCloseTo(100, 0)
    expect(resume.remainingMeters).toBeCloseTo(100, 0)
  })

  it('annonce 100 % sans tronçon restant', () => {
    const resume = resumeObjectif(GR7, echantillons([true, true]), 100)
    expect(resume.pct).toBe(100)
    expect(resume.remainingMeters).toBe(0)
    expect(resume.troncons).toEqual([])
  })

  it('reste lisible pour un itinéraire sans échantillon', () => {
    // Zone déchargée, matching pas encore calculé : pas de division par zéro,
    // pas de « NaN % ».
    const resume = resumeObjectif(GR7, [], 100)
    expect(resume.pct).toBe(0)
    expect(resume.remainingMeters).toBe(0)
    expect(resume.troncons).toEqual([])
  })
})
