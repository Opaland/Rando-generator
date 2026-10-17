import { describe, it, expect } from 'vitest'
import { recouvrementAvecTronc } from '../../src/core/variantes.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

function itineraire(
  osmRelationId: number,
  ref: string | null,
  ways: TrailWay[],
): Itinerary {
  return {
    osmRelationId,
    ref,
    name: 'test',
    network: 'GR',
    ways,
    totalMeters: ways.reduce(
      (total, w) => total + polylineLengthMeters(w.coords),
      0,
    ),
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

/** ~785 m par pas de 0,01° de longitude à 45,4° de latitude. */
const way = (osmWayId: number, depart: number): TrailWay => ({
  osmWayId,
  coords: [
    [depart, 45.4],
    [depart + 0.01, 45.4],
  ],
})

describe('recouvrementAvecTronc (#333)', () => {
  it('rend null si la ref ne dérive pas (pas de lettre finale)', () => {
    const gr76 = itineraire(1, 'GR 76', [way(1, 0)])
    expect(recouvrementAvecTronc(gr76, [gr76])).toBeNull()
  })

  it('n’accepte pas une ref qui continue après la lettre dérivée', () => {
    // Trouvé par mutation du 17/10 : sans l'ancre `$` de REF_DERIVEE,
    // « GR 76A Bis » se faisait quand même dériver en « GR 76 », en
    // ignorant tout ce qui suit la lettre.
    const variante = itineraire(1, 'GR 76A Bis', [way(1, 0)])
    const tronc = itineraire(2, 'GR 76', [way(2, 0)])
    expect(recouvrementAvecTronc(variante, [variante, tronc])).toBeNull()
  })

  it('reconnaît une ref dérivée avec un espace avant la lettre', () => {
    // Trouvé par mutation du 17/10 : `\s?` retourné en `\S?` ne matchait
    // plus aucune ref dont la lettre finale est précédée d'un espace.
    const tronc = itineraire(2, 'GR 76', [way(2, 0)])
    const variante = itineraire(1, 'GR 76 A', [way(2, 0)])
    const resultat = recouvrementAvecTronc(variante, [variante, tronc])
    expect(resultat?.tronc.osmRelationId).toBe(2)
  })

  it('rend null si la ref est absente', () => {
    const sansRef = itineraire(1, null, [way(1, 0)])
    expect(recouvrementAvecTronc(sansRef, [sansRef])).toBeNull()
  })

  it('ne confond pas « pas de ref dérivée » avec « un autre itinéraire sans ref »', () => {
    /*
      Trouvé par mutation du 17/10 : désactiver `if (!refTronc) return null`
      laissait passer tous les tests existants, parce qu'aucun ne mettait
      dans la liste un second itinéraire dont la ref est `null` — `autre.ref
      ?.trim() === refTronc` vaut alors `undefined === undefined`, donc
      `true`, quand refTronc n'a jamais été dérivé (lui aussi `undefined`).
    */
    const gr76 = itineraire(1, 'GR 76', [way(1, 0)])
    const sansRef = itineraire(2, null, [way(2, 5)])
    expect(recouvrementAvecTronc(gr76, [gr76, sansRef])).toBeNull()
  })

  it('rend null si le tronc dérivé n’est pas dans la liste (hors zone)', () => {
    const variante = itineraire(2, 'GR 76A', [way(2, 0)])
    expect(recouvrementAvecTronc(variante, [variante])).toBeNull()
  })

  it('ne prend pas le premier autre itinéraire venu pour le tronc', () => {
    /*
      Trouvé par mutation du 17/10 : la recherche du tronc ne vérifiait
      réellement sa ref que dans des cas où le seul autre itinéraire
      présent était déjà le bon. Un leurre placé avant le vrai tronc, avec
      un id différent mais une ref qui ne correspond pas, doit être
      ignoré.
    */
    const leurre = itineraire(20, 'GR 99', [way(20, 2)])
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [way(1, 0)])
    const resultat = recouvrementAvecTronc(variante, [leurre, tronc, variante])
    expect(resultat?.tronc.osmRelationId).toBe(10)
  })

  it('ignore les espaces de la ref du tronc avant de la comparer', () => {
    // Trouvé par mutation du 17/10 : sans le `.trim()` sur `autre.ref`, un
    // tronc dont la ref porte un espace final n'était plus reconnu.
    const tronc = itineraire(10, 'GR 76 ', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [way(1, 0)])
    const resultat = recouvrementAvecTronc(variante, [tronc, variante])
    expect(resultat?.tronc.osmRelationId).toBe(10)
  })

  it('ne lève pas sur un autre itinéraire sans ref pendant la recherche du tronc', () => {
    // Trouvé par mutation du 17/10 : `autre.ref?.trim` sans son `?.`
    // lèverait sur un itinéraire dont la ref est `null`, rencontré avant
    // le vrai tronc.
    const sansRef = itineraire(20, null, [way(20, 2)])
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [way(1, 0)])
    expect(() =>
      recouvrementAvecTronc(variante, [sansRef, tronc, variante]),
    ).not.toThrow()
  })

  it('mesure le recouvrement par way partagé, pas par distance estimée', () => {
    const w1 = way(1, 0) // partagé
    const w2 = way(2, 0.01) // propre au tronc
    const w3 = way(3, 0.02) // propre à la variante
    const tronc = itineraire(10, 'GR 76', [w1, w2])
    const variante = itineraire(11, 'GR 76A', [w1, w3])

    const resultat = recouvrementAvecTronc(variante, [tronc, variante])

    expect(resultat).not.toBeNull()
    expect(resultat?.tronc.osmRelationId).toBe(10)
    expect(resultat?.pourcentageDeLaVariante).toBeCloseTo(50, 0)
    expect(resultat?.metresPartages).toBeGreaterThan(0)
  })

  it('rend 0 %, pas null, quand la ref dérive mais qu’aucun way n’est partagé (GR 76A réel)', () => {
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [way(2, 1)])

    const resultat = recouvrementAvecTronc(variante, [tronc, variante])

    expect(resultat).not.toBeNull()
    expect(resultat?.pourcentageDeLaVariante).toBe(0)
  })

  it('ignore les espaces de la ref avant de la comparer au tronc', () => {
    // Trouvé par mutation du 17/10 : sans le `.trim()`, une ref avec un
    // espace final (« GR 76A ») ne matchait plus `$` dans REF_DERIVEE, et
    // la variante retombait à `null` au lieu de se rattacher à son tronc.
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A ', [way(1, 0)])
    const resultat = recouvrementAvecTronc(variante, [tronc, variante])
    expect(resultat).not.toBeNull()
    expect(resultat?.tronc.osmRelationId).toBe(10)
  })

  it('rend 0 %, pas NaN, pour une variante sans aucun tracé', () => {
    // Trouvé par mutation du 17/10 : la garde `itin.totalMeters > 0`
    // désactivée (ou assouplie en `>= 0`, toujours vraie en pratique)
    // laissait calculer 0 / 0, qui vaut NaN plutôt que 0.
    const tronc = itineraire(10, 'GR 76', [way(1, 0)])
    const variante = itineraire(11, 'GR 76A', [])
    const resultat = recouvrementAvecTronc(variante, [tronc, variante])
    expect(resultat?.pourcentageDeLaVariante).toBe(0)
  })

  it('ne se prend jamais elle-même pour son tronc', () => {
    // Une ref pathologique qui matcherait la regex sans qu'aucun autre
    // itinéraire ne porte la base : doit rester null, pas se rattacher à soi.
    const seul = itineraire(1, 'GR 7A', [way(1, 0)])
    expect(recouvrementAvecTronc(seul, [seul])).toBeNull()
  })
})
