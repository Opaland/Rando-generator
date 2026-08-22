import { describe, it, expect } from 'vitest'
import {
  familleRevetement,
  libelleRevetement,
  bandesDeRevetement,
  couvertureRevetement,
  type Bande,
} from '../../src/core/revetement.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

/**
 * Issue #179, second volet — le revêtement porté par le profil altimétrique.
 *
 * La mesure sur la donnée réelle a décidé de la forme : sur 1 086 km
 * d'itinéraires du Pilat, `surface` couvre 33 % de la longueur et
 * `smoothness` 6 %. Deux tiers sont non renseignés, sur *chaque* itinéraire
 * sans exception.
 *
 * Un filtre binaire « praticable » trancherait donc sur un tiers de
 * l'information en laissant croire qu'il tranche sur tout. D'où le choix de
 * montrer **où** c'est connu le long du parcours, plutôt que de conclure.
 */
function way(id: number, coords: [number, number][], tags?: Record<string, string>): TrailWay {
  return tags ? { osmWayId: id, coords, tags } : { osmWayId: id, coords }
}

function itineraire(ways: TrailWay[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: null,
    name: 'test',
    network: 'PR',
    ways,
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
    osmUpdatedAt: null,
  }
}

/** ~785 m par pas de 0,01° de longitude à 45,4° de latitude. */
const ligne = (depart: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [depart + i * 0.01, 45.4])

describe('familleRevetement', () => {
  it('range les revêtements durs ensemble', () => {
    for (const v of ['asphalt', 'concrete', 'paved', 'paving_stones']) {
      expect(familleRevetement(v)).toBe('dur')
    }
  })

  it('range les surfaces stabilisées ensemble', () => {
    for (const v of ['compacted', 'fine_gravel', 'gravel']) {
      expect(familleRevetement(v)).toBe('stabilise')
    }
  })

  it('range les sols naturels ensemble', () => {
    for (const v of ['ground', 'dirt', 'earth', 'grass', 'sand', 'rock']) {
      expect(familleRevetement(v)).toBe('naturel')
    }
  })

  it('ne range pas de force une valeur qu’il ne connaît pas', () => {
    // OSM accepte n'importe quelle chaîne. Deviner la famille d'une valeur
    // rare, c'est décider à la place de quelqu'un qui décide de s'engager.
    // « tartan » est le revêtement des pistes d'athlétisme : une vraie
    // valeur OSM, absente de la table parce qu'on n'en croise pas en
    // randonnée.
    expect(familleRevetement('tartan')).toBe('autre')
    expect(familleRevetement('')).toBe('autre')
  })

  it('dit « inconnu » pour une absence, jamais « autre »', () => {
    // La distinction porte tout : « autre » dit qu'OSM sait et qu'on ne
    // classe pas ; « inconnu » dit qu'OSM ne sait pas. C'est le cas des
    // deux tiers de la longueur mesurée.
    expect(familleRevetement(null)).toBe('inconnu')
  })
})

describe('libelleRevetement', () => {
  it('traduit sans réinterpréter', () => {
    expect(libelleRevetement('asphalt')).toMatch(/bitume|asphalte/i)
    expect(libelleRevetement('gravel')).toMatch(/gravier/i)
  })

  it('rend la valeur brute quand il ne la connaît pas', () => {
    // Mieux vaut afficher « tartan » que d'inventer une traduction : la
    // personne peut chercher ce que c'est, là où un mot approchant la
    // renseignerait mal.
    expect(libelleRevetement('tartan')).toContain('tartan')
  })

  it('nomme l’absence explicitement', () => {
    expect(libelleRevetement(null)).toMatch(/non renseigné/i)
  })
})

describe('bandesDeRevetement', () => {
  it('rend une bande par way, en distance cumulée', () => {
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { surface: 'asphalt' }),
        way(2, ligne(4.52, 3), { surface: 'gravel' }),
      ]),
    )
    expect(bandes).toHaveLength(2)
    expect(bandes[0]!.debut).toBe(0)
    expect(bandes[0]!.surface).toBe('asphalt')
    // La seconde reprend exactement là où la première s'arrête : un trou
    // ferait apparaître de l'inconnu qui n'existe pas.
    expect(bandes[1]!.debut).toBeCloseTo(bandes[0]!.fin, 6)
  })

  it('fusionne deux ways voisins de même revêtement', () => {
    // Sans fusion, un long itinéraire rendrait des centaines de bandes
    // identiques — illisible à l'écran, et coûteux à peindre.
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { surface: 'asphalt' }),
        way(2, ligne(4.52, 3), { surface: 'asphalt' }),
        way(3, ligne(4.54, 3), { surface: 'gravel' }),
      ]),
    )
    expect(bandes).toHaveLength(2)
    expect(bandes[0]!.surface).toBe('asphalt')
  })

  it('fusionne aussi les inconnus voisins', () => {
    const bandes = bandesDeRevetement(
      itineraire([way(1, ligne(4.5, 3)), way(2, ligne(4.52, 3))]),
    )
    expect(bandes).toHaveLength(1)
    expect(bandes[0]!.surface).toBeNull()
  })

  it('n’invente rien quand aucun way n’a de tags', () => {
    const bandes = bandesDeRevetement(itineraire([way(1, ligne(4.5, 5))]))
    expect(bandes).toHaveLength(1)
    expect(bandes[0]!.surface).toBeNull()
    expect(bandes[0]!.debut).toBe(0)
    expect(bandes[0]!.fin).toBeGreaterThan(0)
  })

  it('ignore un way trop court pour avoir une longueur', () => {
    const bandes = bandesDeRevetement(
      itineraire([way(1, [[4.5, 45.4]], { surface: 'asphalt' }), way(2, ligne(4.5, 3))]),
    )
    expect(bandes).toHaveLength(1)
    expect(bandes[0]!.surface).toBeNull()
  })

  it('rend un tableau vide plutôt qu’une bande de longueur nulle', () => {
    expect(bandesDeRevetement(itineraire([]))).toEqual([])
  })
})

describe('couvertureRevetement', () => {
  const bandes = (b: [number, number, string | null][]): Bande[] =>
    b.map(([debut, fin, surface]) => ({ debut, fin, surface }))

  it('dit quelle fraction de la longueur est renseignée', () => {
    // C'est le chiffre qui doit être affiché, et non un verdict : mesuré
    // sur la donnée réelle, il vaut 33 % en moyenne et descend à 1 %.
    const c = couvertureRevetement(bandes([[0, 200, 'asphalt'], [200, 1000, null]]))
    expect(c.connuMetres).toBe(200)
    expect(c.totalMetres).toBe(1000)
    expect(c.fraction).toBeCloseTo(0.2, 3)
  })

  it('rend zéro sans diviser par zéro', () => {
    const c = couvertureRevetement([])
    expect(c.fraction).toBe(0)
    expect(Number.isFinite(c.fraction)).toBe(true)
  })
})
