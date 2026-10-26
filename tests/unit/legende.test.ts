import { describe, it, expect } from 'vitest'
import { contenuLegende } from '../../src/core/legende.ts'
import { RESEAUX_FILTRABLES } from '../../src/core/reseaux.ts'
import type { Itinerary, Network } from '../../src/core/types.ts'

/** Aucun filtre de réseau : tout ce qui est chargé est dessiné. */
const TOUS: ReadonlySet<Network> = new Set(RESEAUX_FILTRABLES)

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
      reseauxVisibles: TOUS,
    })
    expect(contenu.reseaux).toEqual(['GR', 'PR'])
  })

  /*
    Issue #594 — en Nouvelle-Calédonie, le filtre par défaut masquait le seul
    GR de la zone, et la légende l'annonçait en rouge au-dessus d'une carte
    qui n'en dessinait aucun. Elle lit maintenant le même filtre que la
    carte (`itinerairesVisibles`).
  */
  it('ne nomme pas un réseau que le filtre retire de la carte', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR'), itineraire('PR')],
      itinerairesPerso: [itineraire('PERSO')],
      aDesTraces: false,
      reseauxVisibles: new Set<Network>(['PR']),
    })
    // Les itinéraires perso n'ont pas de filtre : ils restent nommés.
    expect(contenu.reseaux).toEqual(['PR', 'PERSO'])
  })

  it('n’a plus rien à nommer quand le filtre retire tout', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: new Set<Network>(),
    })
    expect(contenu.vide).toBe(true)
  })

  it('garde l’ordre de la charte, pas celui d’arrivée', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('LOCAL'), itineraire('PR'), itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: TOUS,
    })
    expect(contenu.reseaux).toEqual(['GR', 'PR', 'LOCAL'])
  })

  it('compte les itinéraires personnels comme un réseau à part', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [itineraire('PERSO')],
      aDesTraces: false,
      reseauxVisibles: TOUS,
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
      reseauxVisibles: TOUS,
    })
    expect(sans.etats).toBe(false)

    const avec = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: true,
      reseauxVisibles: TOUS,
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
      reseauxVisibles: TOUS,
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
        reseauxVisibles: TOUS,
      }).vide,
    ).toBe(false)
    // Des traces sans itinéraire : il reste parcouru/restant à expliquer.
    expect(
      contenuLegende({
        itineraires: [],
        itinerairesPerso: [],
        aDesTraces: true,
        reseauxVisibles: TOUS,
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
      reseauxVisibles: TOUS,
    })
    expect(contenu.terrains).toEqual([])
  })

  it('nomment ce que la bande peint, et dans l’ordre de la charte', () => {
    const contenu = contenuLegende({
      itineraires: [gr],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: TOUS,
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
      reseauxVisibles: TOUS,
      itineraireRegarde: muet.osmRelationId,
    })
    expect(contenu.terrains).toEqual([])
  })

  it('n’empêchent pas la légende d’être vide quand il n’y a rien', () => {
    const contenu = contenuLegende({
      itineraires: [],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: TOUS,
    })
    expect(contenu.vide).toBe(true)
  })
})

/**
 * Le réseau balisé du Département (PDIPR, #87).
 *
 * Même règle : nommé quand il est **dessiné**, c'est-à-dire reçu — pas quand
 * la zone pourrait en avoir un. Hors ligne, le fichier n'arrive pas ; une
 * légende qui le nommerait quand même mentirait.
 */
describe('le réseau balisé du Département', () => {
  it('est nommé quand des tronçons sont peints', () => {
    const contenu = contenuLegende({
      itineraires: [],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: TOUS,
      reseauDeFond: true,
    })
    expect(contenu.reseauDeFond).toBe(true)
    // Seul sur la carte, il suffit à justifier la légende.
    expect(contenu.vide).toBe(false)
  })

  it('n’est pas nommé quand rien n’est peint', () => {
    const contenu = contenuLegende({
      itineraires: [itineraire('GR')],
      itinerairesPerso: [],
      aDesTraces: false,
      reseauxVisibles: TOUS,
    })
    expect(contenu.reseauDeFond).toBe(false)
  })
})

/*
  Survivants équivalents de la vague du 18/10 sur `contenuLegende` (§6bis) :
  - la garde `segment.famille === 'inconnu'` retirée : « inconnu » entre dans
    l'ensemble, mais `ORDRE_TERRAIN` (dur, stabilisé, naturel, autre) ne le
    contient pas, et le filtre qui suit l'écarte ;
  - `terrains.length === 0` remplacé par `true` dans `vide` : un terrain
    n'est nommé que pour l'itinéraire regardé, dont le réseau figure dans
    `ORDRE_DES_RESEAUX` — qui porte les sept valeurs de `Network` — donc
    `reseaux` n'est jamais vide quand `terrains` ne l'est pas.
*/
