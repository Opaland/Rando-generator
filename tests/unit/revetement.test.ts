import { describe, it, expect } from 'vitest'
import {
  familleRevetement,
  libelleRevetement,
  bandesDeRevetement,
  couvertureRevetement,
  revetementDuChemin,
  partsDeRevetement,
  type Bande,
} from '../../src/core/revetement.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'
import { itineraryCoords } from '../../src/core/mapdata.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'

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
function way(
  id: number,
  coords: [number, number][],
  tags?: TrailWay['tags'],
): TrailWay {
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

  /*
    Le 25/08, Cédric : « les terrains sont coupés — Via Lugdunum, Lyon au
    Puy-en-Velay ». Les bandes s'arrêtaient à mi-largeur du profil.

    Les deux axes ne sont pas le même. Le profil mesure la **polyligne
    concaténée** (`itineraryCoords`, puis `distancesCumulees`) : les sauts
    entre deux ways disjoints y comptent, puisqu'on les parcourt en ligne
    droite sur le graphique. Les bandes, elles, additionnaient les longueurs
    de chaque way **sans les sauts**. Sur un itinéraire contigu les deux
    totaux coïncident — c'est le cas de toutes les boucles du Pilat, et
    c'est pourquoi rien ne se voyait. Sur un long itinéraire troué, les
    bandes finissent d'autant plus tôt qu'il y a de trous.

    Un commentaire d'`ItineraryDetail.tsx` affirmait « leur axe est la même
    distance cumulée ». Il était vrai là où il a été écrit, faux partout
    ailleurs (CLAUDE.md §4bis). L'invariant est donc asserté contre la
    source de vérité du graphique, et non contre un nombre recopié.
  */
  it('tient l’axe du profil, sauts entre ways compris', () => {
    const itin = itineraire([
      way(1, ligne(4.5, 3), { surface: 'asphalt' }),
      // Un trou de 0,08° — six kilomètres de rien entre deux tronçons.
      way(2, ligne(4.6, 3), { surface: 'gravel' }),
    ])
    const bandes = bandesDeRevetement(itin)
    const axeDuProfil = polylineLengthMeters(itineraryCoords(itin))

    expect(bandes.at(-1)!.fin).toBeCloseTo(axeDuProfil, 0)
    // Et le trou n'est pas peint : rien n'a été relevé là.
    expect(bandes[1]!.debut).toBeGreaterThan(bandes[0]!.fin)
  })

  it('ne fusionne pas deux tronçons de même sol séparés par un trou', () => {
    /*
      Fusionner par-dessus un saut peindrait le revêtement du premier
      tronçon sur six kilomètres que personne n'a relevés — une affirmation
      inventée, exactement ce que le reste du module refuse de faire.
    */
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { surface: 'asphalt' }),
        way(2, ligne(4.6, 3), { surface: 'asphalt' }),
      ]),
    )
    expect(bandes).toHaveLength(2)
  })

  it('fusionne en gardant la fin du second, pas une soustraction', () => {
    // Trouvé par mutation : `derniere.fin = curseur + longueur` remplacé
    // par `curseur - longueur` survivait. Les tests comptaient les bandes
    // et lisaient leur revêtement, jamais leurs bornes — une fusion pouvait
    // donc rendre une bande qui finit avant de commencer.
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { surface: 'asphalt' }),
        way(2, ligne(4.52, 3), { surface: 'asphalt' }),
      ]),
    )
    expect(bandes).toHaveLength(1)
    const seule = bandes[0]!
    expect(seule.debut).toBe(0)
    expect(seule.fin).toBeGreaterThan(seule.debut)
    // La bande fusionnée couvre bien les deux ways, et non l'un moins l'autre.
    const seul = bandesDeRevetement(
      itineraire([way(1, ligne(4.5, 3), { surface: 'asphalt' })]),
    )[0]!
    expect(seule.fin).toBeCloseTo(seul.fin * 2, 0)
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
      itineraire([
        way(1, [[4.5, 45.4]], { surface: 'asphalt' }),
        way(2, ligne(4.5, 3)),
      ]),
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
    b.map(([debut, fin, surface]) => ({
      debut,
      fin,
      surface,
      famille: familleRevetement(surface),
      origine: surface === null ? 'inconnu' : 'renseigne',
    }))

  it('dit quelle fraction de la longueur est renseignée', () => {
    // C'est le chiffre qui doit être affiché, et non un verdict : mesuré
    // sur la donnée réelle, il vaut 33 % en moyenne et descend à 1 %.
    const c = couvertureRevetement(
      bandes([
        [0, 200, 'asphalt'],
        [200, 1000, null],
      ]),
    )
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

/**
 * La déduction depuis le type de voie (issue #179).
 *
 * Mesurée, pas supposée. Sur les 3 489 chemins réels du relevé, en ne
 * regardant que ceux dont le revêtement *est* renseigné :
 *
 *     secondary    180 connus   100 % dur    asphalt 100 %
 *     tertiary     191 connus   100 % dur    asphalt  96 %
 *     primary       69 connus   100 % dur    asphalt  97 %
 *     residential  256 connus    97 % dur    asphalt  93 %
 *     unclassified 176 connus    93 % dur    asphalt  91 %
 *     track        246 connus     7 % dur    ground  41 %
 *     path         117 connus    24 % dur    ground  23 %
 *     cycleway      25 connus    56 % dur    réellement partagé
 *
 * Effet sur la couverture : l'inconnu tombe de 67 % à 1,2 % de la longueur.
 *
 * Les deux erreurs possibles vont dans le sens sûr. Déduire « dur » sur une
 * voie carrossable se trompe dans 0 à 7 % des cas ; déduire « non revêtu »
 * sur un sentier fait éviter un chemin qui était praticable — cela coûte une
 * occasion, jamais un danger.
 */
describe('revetementDuChemin', () => {
  it('rend le revêtement renseigné quand il existe, sans rien déduire', () => {
    const r = revetementDuChemin({ surface: 'gravel', highway: 'residential' })
    expect(r.origine).toBe('renseigne')
    expect(r.surface).toBe('gravel')
    expect(r.famille).toBe('stabilise')
  })

  it('déduit « dur » d’une voie carrossable', () => {
    for (const highway of [
      'primary',
      'secondary',
      'tertiary',
      'residential',
      'unclassified',
      'living_street',
    ]) {
      const r = revetementDuChemin({ highway })
      expect(r.origine, highway).toBe('deduit')
      expect(r.famille, highway).toBe('dur')
      // Aucune valeur brute : on n'a pas lu « asphalt », on l'a déduit.
      expect(r.surface, highway).toBeNull()
    }
  })

  it('déduit « naturel » d’un chemin ou d’un sentier', () => {
    for (const highway of ['track', 'path', 'bridleway']) {
      const r = revetementDuChemin({ highway })
      expect(r.origine, highway).toBe('deduit')
      expect(r.famille, highway).toBe('naturel')
    }
  })

  it('ne déduit rien d’un type réellement partagé', () => {
    // `cycleway` est dur dans 56 % des cas mesurés, `footway` dans 86 % mais
    // sur peu de cas, `service` dans 71 %. Déduire sur ces types reviendrait
    // à jouer à pile ou face en le présentant comme un renseignement.
    for (const highway of ['cycleway', 'service', 'steps', 'pedestrian']) {
      const r = revetementDuChemin({ highway })
      expect(r.origine, highway).toBe('inconnu')
      expect(r.famille, highway).toBe('inconnu')
    }
  })

  it('ne déduit rien d’un chemin sans aucun tag', () => {
    expect(revetementDuChemin(undefined).origine).toBe('inconnu')
    expect(revetementDuChemin({}).origine).toBe('inconnu')
  })
})

describe('les bandes portent l’origine de ce qu’elles disent', () => {
  it('distingue le renseigné du déduit', () => {
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { surface: 'asphalt', highway: 'residential' }),
        way(2, ligne(4.52, 3), { highway: 'residential' }),
      ]),
    )
    // Même famille, mais on ne les fusionne pas : l'une est lue, l'autre
    // est supposée, et la nuance doit rester visible à l'écran.
    expect(bandes).toHaveLength(2)
    expect(bandes[0]!.origine).toBe('renseigne')
    expect(bandes[1]!.origine).toBe('deduit')
    expect(bandes[0]!.famille).toBe('dur')
    expect(bandes[1]!.famille).toBe('dur')
  })

  it('fusionne deux déductions identiques', () => {
    const bandes = bandesDeRevetement(
      itineraire([
        way(1, ligne(4.5, 3), { highway: 'track' }),
        way(2, ligne(4.52, 3), { highway: 'path' }),
      ]),
    )
    expect(bandes).toHaveLength(1)
    expect(bandes[0]!.famille).toBe('naturel')
    expect(bandes[0]!.origine).toBe('deduit')
  })
})

describe('couvertureRevetement avec déduction', () => {
  it('compte séparément ce qui est lu et ce qui est supposé', () => {
    // Les deux chiffres doivent être montrés séparément : les confondre
    // ferait passer une déduction pour un relevé.
    const c = couvertureRevetement([
      {
        debut: 0,
        fin: 300,
        surface: 'asphalt',
        famille: 'dur',
        origine: 'renseigne',
      },
      {
        debut: 300,
        fin: 800,
        surface: null,
        famille: 'naturel',
        origine: 'deduit',
      },
      {
        debut: 800,
        fin: 1000,
        surface: null,
        famille: 'inconnu',
        origine: 'inconnu',
      },
    ])
    expect(c.connuMetres).toBe(300)
    expect(c.deduitMetres).toBe(500)
    expect(c.inconnuMetres).toBe(200)
    expect(c.fraction).toBeCloseTo(0.3, 3)
  })
})

/**
 * La part roulante d'un itinéraire (issue #179).
 *
 * Nadia sort avec sa fille en fauteuil tout-terrain. Elle ne cherche pas
 * « un parcours accessible » — l'étiquette ne veut rien dire et elle a appris
 * à s'en méfier. Elle cherche ce qu'il y a sous les roues, et elle sait lire
 * une donnée absente ; ce qu'elle ne pardonne pas, c'est une promesse fausse.
 *
 * D'où deux règles, et la seconde est la vraie :
 *
 * 1. la part se calcule **en longueur**, pas en nombre de tronçons — un
 *    kilomètre de sentier et dix mètres de bitume ne se comptent pas pareil ;
 * 2. **l'inconnu est une part comme les autres, et il est rendu.** Le noyer
 *    dans « naturel » ou le retirer du dénominateur ferait passer un
 *    itinéraire dont on ne sait rien pour un itinéraire dont on sait qu'il
 *    est roulant.
 */
describe('partsDeRevetement (#179)', () => {
  function itinAvecSurfaces(
    surfaces: (string | undefined)[],
  ): Parameters<typeof partsDeRevetement>[0] {
    return {
      osmRelationId: 1,
      ref: null,
      name: null,
      network: 'PR',
      totalMeters: 0,
      fetchedAt: '2026-08-25T00:00:00Z',
      ways: surfaces.map((surface, i) => ({
        osmWayId: 100 + i,
        // 1e-4 ° de longitude ≈ 7,8 m à 45,4° — la longueur exacte importe
        // peu, seule leur égalité compte pour lire les parts.
        coords: [
          [4.5 + i * 0.001, 45.4],
          [4.5 + i * 0.001 + 0.0001, 45.4],
        ] as [number, number][],
        ...(surface === undefined ? {} : { tags: { surface } }),
      })),
    }
  }

  it('rend la part de chaque famille, en longueur', () => {
    const parts = partsDeRevetement(
      itinAvecSurfaces(['asphalt', 'asphalt', 'compacted', 'ground']),
    )
    expect(parts.dur).toBeCloseTo(0.5, 2)
    expect(parts.stabilise).toBeCloseTo(0.25, 2)
    expect(parts.naturel).toBeCloseTo(0.25, 2)
    expect(parts.inconnu).toBeCloseTo(0, 2)
  })

  it('rend l’inconnu plutôt que de le répartir ailleurs', () => {
    const parts = partsDeRevetement(itinAvecSurfaces(['asphalt', undefined]))
    expect(parts.dur).toBeCloseTo(0.5, 2)
    expect(
      parts.inconnu,
      'un itinéraire dont on ne sait rien passerait pour roulant',
    ).toBeCloseTo(0.5, 2)
  })

  it('les parts somment à 1', () => {
    const parts = partsDeRevetement(
      itinAvecSurfaces(['asphalt', 'gravel', 'ground', undefined, 'sand']),
    )
    const somme = Object.values(parts).reduce((a, b) => a + b, 0)
    expect(somme).toBeCloseTo(1, 6)
  })

  it('un itinéraire sans longueur ne rend pas NaN', () => {
    const parts = partsDeRevetement(itinAvecSurfaces([]))
    expect(Object.values(parts).every((p) => p === 0)).toBe(true)
  })
})
