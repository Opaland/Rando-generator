import { describe, it, expect } from 'vitest'
import { contenuLegende } from '../../src/core/legende.ts'
import type { Itinerary, Network } from '../../src/core/types.ts'

/**
 * AUDIT_UX.md, constat U6 — la légende occupait 100 px sur les 350 de carte
 * visible sur téléphone, soit 28 %, en permanence, et en haut, là où se
 * trouve le tracé après un cadrage.
 *
 * Six entrées, dont la moitié ne concernait pas la zone affichée. Une
 * légende qui nomme des couleurs absentes de la carte n'aide pas à lire :
 * elle occupe de la place pour dire ce qui n'est pas là.
 *
 * La règle : **la légende ne nomme que ce qui est dessiné.**
 */

let compteur = 0
/** Le minimum d'un itinéraire : son réseau, et ses tronçons quand on les veut. */
function itineraire(network: Network, ways?: Itinerary['ways']): Itinerary {
  compteur += 1
  return {
    osmRelationId: compteur,
    name: `Test ${network}`,
    ref: null,
    network,
    ways: ways ?? [{ osmWayId: compteur, coords: [[4.5, 45.4], [4.51, 45.4]] }],
    totalMeters: 780,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

describe('contenuLegende', () => {
  it('ne nomme que les réseaux réellement sur la carte', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR'), itineraire('PR'), itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(contenu.reseaux).toEqual(['GR', 'PR'])
  })

  it('garde l’ordre de la charte, pas celui d’arrivée', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('LOCAL'), itineraire('PR'), itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(contenu.reseaux).toEqual(['GR', 'PR', 'LOCAL'])
  })

  it('compte les itinéraires personnels comme un réseau à part', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [itineraire('PERSO')],
      aDesTraces: false,
    })
    expect(contenu.reseaux).toEqual(['GR', 'PERSO'])
  })

  /**
   * Parcouru et restant ne veulent rien dire tant qu'aucune trace n'a été
   * importée : tout est restant, et la distinction occupe une ligne pour
   * n'apprendre rien.
   */
  it('ne distingue parcouru et restant qu’une fois une trace là', () => {
    const sans = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(sans.etats).toBe(false)

    const avec = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: true,
    })
    expect(avec.etats).toBe(true)
  })

  /**
   * L'invariant : une légende qui n'a rien à nommer n'a pas à être là. Sans
   * cela, la carte vide du premier lancement porterait un cadre vide.
   */
  it('n’a rien à dire quand la carte est vide', () => {
    const contenu = contenuLegende({
      itineraires: [],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(contenu.reseaux).toEqual([])
    expect(contenu.etats).toBe(false)
    expect(contenu.vide).toBe(true)
  })

  it('n’est pas vide dès qu’il y a quelque chose à nommer', () => {
    expect(
      contenuLegende({
        itineraires: [itineraire('GR')],
        itinerairesPerso: [],
        aDesTraces: false,
      }).vide,
    ).toBe(false)
    // Des traces sans itinéraire : il reste parcouru/restant à expliquer.
    expect(
      contenuLegende({
        itineraires: [],
        itinerairesPerso: [],
        aDesTraces: true,
      }).vide,
    ).toBe(false)
  })
})

/**
 * Le terrain dans la légende (24/08).
 *
 * La bande de revêtement est un code de plus sur la carte, et la règle de ce
 * module ne bouge pas : **la légende ne nomme que ce qui est dessiné**. La
 * bande n'existe que pour l'itinéraire dont la fiche est ouverte ; les
 * familles nommées sont donc celles de cet itinéraire-là, et rien d'autre.
 *
 * Nommer les cinq familles en permanence aurait refait le constat U6 —
 * six entrées dont la moitié ne concernait pas la zone affichée, occupant
 * 28 % de la carte visible d'un téléphone.
 */
describe('les familles de terrain', () => {
  const gr = itineraire('GR', [
    { osmWayId: 1, coords: [[4.5, 45.4], [4.51, 45.4]], tags: { surface: 'asphalt' } },
    { osmWayId: 2, coords: [[4.51, 45.4], [4.52, 45.4]], tags: { highway: 'path' } },
  ])

  it('ne sont pas nommées tant qu’aucune fiche n’est ouverte', () => {
    const contenu = contenuLegende({
      itineraires: [gr],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(contenu.terrains).toEqual([])
  })

  it('nomment ce que la bande peint, et dans l’ordre de la charte', () => {
    const contenu = contenuLegende({
      itineraires: [gr],
      itinerairesPerso: [],
      aDesTraces: false,
      itineraireRegarde: gr.osmRelationId,
    })
    expect(contenu.terrains).toEqual(['dur', 'naturel'])
  })

  /**
   * L'inconnu ne se peint pas : le nommer promettrait une couleur que la
   * carte ne montre nulle part.
   */
  it('taisent ce que la carte ne peint pas', () => {
    const muet = itineraire('GR', [
      { osmWayId: 3, coords: [[4.5, 45.4], [4.51, 45.4]] },
    ])
    const contenu = contenuLegende({
      itineraires: [muet],
      itinerairesPerso: [],
      aDesTraces: false,
      itineraireRegarde: muet.osmRelationId,
    })
    expect(contenu.terrains).toEqual([])
  })

  it('n’empêchent pas la légende d’être vide quand il n’y a rien', () => {
    const contenu = contenuLegende({
      itineraires: [],
      itinerairesPerso: [],
      aDesTraces: false,
    })
    expect(contenu.vide).toBe(true)
  })
})
