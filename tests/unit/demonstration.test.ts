import { describe, it, expect } from 'vitest'
import { construireDemonstration } from '../../src/core/demonstration.ts'
import type { Itinerary } from '../../src/core/types.ts'

/**
 * Issue #172 — le premier « aha » du produit exigeait deux actions non
 * triviales et un fichier GPX que le débutant n'a pas.
 *
 * La démonstration fabrique des sorties à partir des itinéraires déjà
 * chargés, en suivant leur géométrie : le pourcentage affiché est donc
 * calculé pour de vrai, par le même code que d'habitude.
 */
function boucle(id: number, points: number, decalage = 0): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `Boucle ${String(id)}`,
    network: 'LOCAL',
    ways: [
      {
        osmWayId: id * 10,
        coords: Array.from(
          { length: points },
          (_, i): [number, number] => [4.8 + i * 0.001, 45.7 + decalage],
        ),
      },
    ],
    totalMeters: points * 78,
    fetchedAt: '2026-08-21T00:00:00Z',

  }
}

describe('construireDemonstration', () => {
  const boucles = [
    boucle(1, 40, 0),
    boucle(2, 60, 0.1),
    boucle(3, 50, 0.2),
    boucle(4, 30, 0.3),
  ]

  it('fabrique des sorties à partir de la géométrie réelle', () => {
    const sorties = construireDemonstration(boucles)
    expect(sorties.length).toBeGreaterThan(0)
    for (const sortie of sorties) {
      const source = boucles.find((b) => b.osmRelationId === sortie.itineraire)
      expect(source).toBeDefined()
      // Les points sont ceux de l'itinéraire, pas des approximations : le
      // matching doit les reconnaître sans dépendre de la tolérance.
      const coords = source!.ways[0]!.coords
      for (const point of sortie.points) {
        expect(coords).toContainEqual(point)
      }
    }
  })

  it('ne montre ni 0 % ni 100 % : une progression en cours', () => {
    const sorties = construireDemonstration(boucles)
    const couverts = new Set(sorties.map((s) => s.itineraire))
    // Au moins un itinéraire touché, au moins un intact — sans quoi le
    // tableau de bord ne montre pas ce qu'il est censé montrer.
    expect(couverts.size).toBeGreaterThan(0)
    expect(couverts.size).toBeLessThan(boucles.length)
    // Et au moins une sortie partielle, pour que « il reste à faire » existe.
    const partielle = sorties.find((s) => {
      const source = boucles.find((b) => b.osmRelationId === s.itineraire)
      return s.points.length < source!.ways[0]!.coords.length
    })
    expect(partielle).toBeDefined()
  })

  it('donne le même résultat à chaque appel', () => {
    // Une démonstration qui change de chiffres d'une fois sur l'autre
    // donnerait l'impression d'un calcul instable.
    expect(construireDemonstration(boucles)).toEqual(
      construireDemonstration(boucles),
    )
  })

  it('nomme les sorties comme des démonstrations', () => {
    for (const sortie of construireDemonstration(boucles)) {
      expect(sortie.nom.toLowerCase()).toContain('démonstration')
    }
  })

  it('ne fabrique rien s’il n’y a pas de quoi', () => {
    expect(construireDemonstration([])).toEqual([])
    expect(construireDemonstration([boucle(1, 1)])).toEqual([])
    // Deux itinéraires ne font pas trois sorties.
    expect(construireDemonstration([boucle(1, 40), boucle(2, 40, 0.1)])).toEqual(
      [],
    )
  })

  it('se contente d’exactement trois itinéraires', () => {
    // La garde en exigeait quatre, au motif que le tableau de bord
    // afficherait sinon 100 %. Mesuré : avec trois, le global vaut 91 % —
    // la dernière sortie est partielle par construction. Refuser ce cas
    // affichait « la démonstration n'a pas pu être préparée » à quelqu'un
    // dont le jeu de données convenait parfaitement.
    const trois = [boucle(1, 40), boucle(2, 60, 0.1), boucle(3, 50, 0.2)]
    const sorties = construireDemonstration(trois)
    expect(sorties).toHaveLength(3)
    // Et la dernière reste partielle : il y a bien « ce qu'il reste à faire ».
    const derniere = sorties[2]!
    const source = trois.find((b) => b.osmRelationId === derniere.itineraire)!
    expect(derniere.points.length).toBeLessThan(source.ways[0]!.coords.length)
  })

  it('reste raisonnable sur un très grand jeu d’itinéraires', () => {
    const beaucoup = Array.from({ length: 400 }, (_, i) =>
      boucle(i + 1, 40, i * 0.01),
    )
    const sorties = construireDemonstration(beaucoup)
    // Une démonstration, pas un import massif : quelques sorties suffisent.
    expect(sorties.length).toBeLessThanOrEqual(4)
  })
})
