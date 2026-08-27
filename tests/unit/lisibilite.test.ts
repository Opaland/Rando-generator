import { describe, it, expect } from 'vitest'
import {
  RESEAUX_REPLIES_PAR_DEFAUT,
  comptesMasques,
  itinerairesVisibles,
  reseauxVisiblesParDefaut,
} from '../../src/core/lisibilite.ts'
import { RESEAUX_FILTRABLES } from '../../src/core/reseaux.ts'
import type { Network } from '../../src/core/types.ts'

/**
 * Le repli des grands itinéraires (#322).
 *
 * Ces tests gardent une chose que ni la liste ni la carte ne peuvent dire
 * seules : **elles doivent répondre la même chose**. La règle vit ici, une
 * fois, et les deux surfaces l'appellent.
 */

function itin(network: Network, id: number) {
  return { network, osmRelationId: id }
}

describe('ce qui est montré au premier écran', () => {
  it('est tout, sauf ce qui est replié', () => {
    expect(reseauxVisiblesParDefaut()).toEqual([
      'GRP',
      'PR',
      'LOCAL',
      'INCONNU',
    ])
  })

  it('ne laisse passer aucun réseau replié, quelle que soit la liste', () => {
    /*
      Écrit en boucle plutôt qu'en dur : le jour où un second réseau se
      replie, ce test le suit tout seul. C'est ce qui distingue une garde
      nommée d'une constante recopiée (§4).
    */
    const defaut = reseauxVisiblesParDefaut()
    for (const replie of RESEAUX_REPLIES_PAR_DEFAUT) {
      expect(defaut).not.toContain(replie)
    }
  })

  it('garde l’ordre de la charte', () => {
    const attendu = RESEAUX_FILTRABLES.filter(
      (r) => !RESEAUX_REPLIES_PAR_DEFAUT.includes(r),
    )
    expect(reseauxVisiblesParDefaut()).toEqual(attendu)
  })

  it('n’invente pas les itinéraires persos', () => {
    // Ils ont leur propre section : une case « PERSO » dans le filtre des
    // réseaux balisés promettrait de les y mêler.
    expect(reseauxVisiblesParDefaut()).not.toContain('PERSO')
  })
})

describe('itinerairesVisibles', () => {
  it('garde ce qui est demandé et retire le reste', () => {
    const tous = [itin('GR', 1), itin('PR', 2), itin('LOCAL', 3)]
    const montres = itinerairesVisibles(tous, new Set<Network>(['PR', 'LOCAL']))
    expect(montres.map((i) => i.osmRelationId)).toEqual([2, 3])
  })

  it('ne rend rien quand rien n’est visible', () => {
    expect(itinerairesVisibles([itin('GR', 1)], new Set<Network>())).toEqual([])
  })

  it('ne touche pas au tableau qu’on lui donne', () => {
    // La carte relit `itineraries` du store à chaque rendu : une fonction qui
    // trierait ou viderait sur place ferait disparaître des itinéraires du
    // tableau de bord, qui les compte tous.
    const tous = [itin('GR', 1), itin('PR', 2)]
    itinerairesVisibles(tous, new Set<Network>(['PR']))
    expect(tous).toHaveLength(2)
  })
})

describe('ce qui est masqué se compte', () => {
  it('par réseau, dans l’ordre de la charte', () => {
    const tous = [itin('PR', 1), itin('GR', 2), itin('GR', 3), itin('INCONNU', 4)]
    expect(comptesMasques(tous, new Set<Network>(['PR']))).toEqual([
      { network: 'GR', nombre: 2 },
      { network: 'INCONNU', nombre: 1 },
    ])
  })

  it('tait les réseaux dont rien n’est masqué', () => {
    // « 0 PR masqués » ferait croire à un filtre actif là où il n'y a rien à
    // montrer — et la phrase de la liste ne s'affiche que si ce tableau est
    // non vide.
    const comptes = comptesMasques([itin('GR', 1)], new Set<Network>(['PR']))
    expect(comptes.map((c) => c.network)).toEqual(['GR'])
  })

  it('ne rend rien quand tout est visible', () => {
    const tous = [itin('GR', 1), itin('PR', 2)]
    expect(comptesMasques(tous, new Set(RESEAUX_FILTRABLES))).toEqual([])
  })

  it('ne compte pas les itinéraires persos parmi les masqués', () => {
    /*
      Un itinéraire perso n'est pas « masqué par le filtre de réseau » : le
      panneau ne propose pas de le filtrer, et il vit dans sa propre section.
      L'annoncer masqué enverrait chercher une case à cocher qui n'existe pas.
    */
    const tous = [itin('PERSO', 1), itin('GR', 2)]
    expect(comptesMasques(tous, new Set<Network>(['PR']))).toEqual([
      { network: 'GR', nombre: 1 },
    ])
  })
})
