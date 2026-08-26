import { describe, it, expect } from 'vitest'
import {
  tronconsContinus,
  statsCumulees,
  elevationStats,
} from '../../src/core/elevation.ts'
import {
  penteMaximaleSurTroncons,
  penteMaximale,
} from '../../src/core/pente.ts'
import { interruptionsDuTrace } from '../../src/core/mapdata.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { ElevationProfile } from '../../src/core/types.ts'

/**
 * Issue #323 — le profil altimétrique traverse les trous en ligne droite.
 *
 * Constat de Cédric le 25/08 sur « La Sente du Sanglier » : la fiche annonce
 * « géométrie en 5 morceaux, 3,9 km d'interruptions », puis affiche
 * « D+ 138 m » et « pente jusqu'à 50,6 % » comme si de rien n'était.
 *
 * Le service altimétrique répond très bien pour les segments de saut : il
 * rend l'altitude du sol sous une ligne droite qui coupe à travers champs.
 * Ces mètres-là entraient dans le D+ et dans la pente, et rien ne disait
 * lesquels.
 */
function profil(
  distances: number[],
  elevations: (number | null)[],
): ElevationProfile {
  return {
    distances,
    elevations,
    coords: distances.map((): [number, number] => [4.5, 45.4]),
  }
}

describe('tronconsContinus', () => {
  it('rend le profil tel quel quand rien ne l’interrompt', () => {
    const p = profil([0, 100, 200], [100, 110, 120])
    expect(tronconsContinus(p, [])).toEqual([p])
  })

  it('ne rend rien d’un profil vide', () => {
    expect(tronconsContinus(profil([], []), [])).toEqual([])
  })

  it('coupe en deux de part et d’autre d’un saut', () => {
    // Saut de 500 m à 800 m : les points 0-800 forment un morceau, ceux
    // d'après un second.
    const p = profil([0, 400, 800, 1_200], [100, 110, 200, 210])
    const [avant, apres] = tronconsContinus(p, [
      { debutMetres: 500, finMetres: 900 },
    ])
    expect(avant?.distances).toEqual([0, 400])
    expect(apres?.distances).toEqual([1_200])
  })

  it('écarte un relevé pris au milieu du saut', () => {
    /*
      C'est le cœur du défaut : ce point décrit un sol qu'on ne foulera pas.
      Le garder ferait monter le D+ d'une combe qui n'est pas sur le chemin —
      et c'est exactement ce que fait un MNT sous une ligne droite tirée à
      travers la campagne.
    */
    const p = profil([0, 600, 1_200], [100, 300, 110])
    const troncons = tronconsContinus(p, [
      { debutMetres: 500, finMetres: 900 },
    ])
    const toutes = troncons.flatMap((t) => t.elevations)
    expect(toutes).not.toContain(300)
    expect(toutes).toEqual([100, 110])
  })

  it('garde les points posés exactement sur les bornes', () => {
    // Un point à la distance où le saut commence est le dernier du morceau
    // d'avant ; un point à la distance où il finit est le premier du suivant.
    // Les jeter perdrait deux relevés parfaitement valides.
    const p = profil([500, 900], [100, 120])
    const troncons = tronconsContinus(p, [
      { debutMetres: 500, finMetres: 900 },
    ])
    expect(troncons.map((t) => t.distances)).toEqual([[500], [900]])
  })

  it('tient plusieurs sauts d’affilée', () => {
    const p = profil([0, 300, 700, 1_100, 1_500], [10, 20, 30, 40, 50])
    const troncons = tronconsContinus(p, [
      { debutMetres: 400, finMetres: 600 },
      { debutMetres: 800, finMetres: 1_000 },
    ])
    expect(troncons.map((t) => t.distances)).toEqual([
      [0, 300],
      [700],
      [1_100, 1_500],
    ])
  })

  it('trie les interruptions qu’on lui donne dans le désordre', () => {
    // `assessItinerary` rend ses trous **du plus grand au plus petit** : les
    // recevoir triés par distance n'est pas acquis, et supposer un ordre est
    // la famille d'échec du §6ter.
    const p = profil([0, 300, 700, 1_100, 1_500], [10, 20, 30, 40, 50])
    const troncons = tronconsContinus(p, [
      { debutMetres: 800, finMetres: 1_000 },
      { debutMetres: 400, finMetres: 600 },
    ])
    expect(troncons.map((t) => t.distances)).toEqual([
      [0, 300],
      [700],
      [1_100, 1_500],
    ])
  })
})

describe('statsCumulees', () => {
  it('additionne les dénivelées sans compter ce qui sépare les morceaux', () => {
    /*
      La mesure du défaut, en petit. Deux morceaux à 100 m d'altitude, et
      entre eux un saut dont le milieu est relevé à 300 m — une colline que
      la ligne droite franchit et que le chemin contourne.
    */
    const p = profil([0, 200, 600, 1_200, 1_400], [100, 100, 300, 100, 100])
    const interruptions = [{ debutMetres: 300, finMetres: 1_100 }]

    const avant = elevationStats(p.elevations)
    const apres = statsCumulees(tronconsContinus(p, interruptions))

    // Avant : 200 m de montée puis 200 m de descente, tous inventés.
    expect(avant?.gain).toBeCloseTo(200, 0)
    expect(avant?.loss).toBeCloseTo(200, 0)
    // Après : plus rien, parce qu'il n'y avait rien.
    expect(apres?.gain).toBe(0)
    expect(apres?.loss).toBe(0)
  })

  it('garde les altitudes extrêmes de l’ensemble', () => {
    // Ce sont des relevés du terrain réel : ils restent vrais quel que soit
    // le découpage. Seules les *dénivelées cumulées* dépendent du chemin.
    const p = profil([0, 200, 1_200], [100, 150, 80])
    const stats = statsCumulees(
      tronconsContinus(p, [{ debutMetres: 300, finMetres: 1_100 }]),
    )
    expect(stats?.min).toBe(80)
    expect(stats?.max).toBe(150)
  })

  it('ne rend rien quand aucun morceau n’a d’altitude', () => {
    expect(statsCumulees([])).toBeNull()
    expect(statsCumulees([profil([0, 100], [null, null])])).toBeNull()
  })
})

describe('penteMaximaleSurTroncons', () => {
  it('ne mesure plus la pente d’un bord de trou à l’autre', () => {
    /*
      Un trou de 800 m entre deux morceaux, avec 400 m de dénivelée d'un bord
      à l'autre : 50 % sur le saut. C'est l'ordre de grandeur de la fiche que
      Cédric a relevée — « jusqu'à 50,6 % » — et personne ne grimpera cette
      pente-là, parce qu'elle n'est sur aucun chemin.
    */
    const p = profil([0, 200, 1_000, 1_200], [100, 110, 500, 505])
    const interruptions = [{ debutMetres: 250, finMetres: 950 }]

    const avant = penteMaximale(p)
    expect(avant.etat).toBe('mesuree')
    if (avant.etat === 'mesuree') {
      expect(avant.pente.pourcent).toBeCloseTo(48.75, 1)
    }

    const apres = penteMaximaleSurTroncons(tronconsContinus(p, interruptions))
    expect(apres.etat).toBe('mesuree')
    if (apres.etat === 'mesuree') {
      // 10 m sur 200, puis 5 m sur 200 : la plus forte est 5 %.
      expect(apres.pente.pourcent).toBeCloseTo(5, 1)
    }
  })

  it('garde la plus forte pente réelle, quel que soit le morceau', () => {
    const troncons = [
      profil([0, 100], [100, 103]),
      profil([1_000, 1_100], [200, 220]),
    ]
    const mesure = penteMaximaleSurTroncons(troncons)
    expect(mesure.etat).toBe('mesuree')
    if (mesure.etat === 'mesuree') expect(mesure.pente.pourcent).toBeCloseTo(20, 1)
  })

  it('préfère « trop fine » à « sans altitude » : il y a quelque chose à dire', () => {
    const mesure = penteMaximaleSurTroncons([
      profil([0, 100], [null, null]),
      profil([500, 500.4], [100, 103]),
    ])
    expect(mesure.etat).toBe('trop-fine')
  })

  it('rend « sans altitude » quand il n’y a vraiment rien', () => {
    expect(penteMaximaleSurTroncons([]).etat).toBe('sans-altitude')
  })
})

describe('interruptionsDuTrace', () => {
  it('ne trouve rien sur un itinéraire d’un seul tenant', () => {
    const itin = makeItinerary(1, [
      { osmWayId: 10, coords: straightLine(4.5, 45.4, 1_000, 10) },
    ])
    expect(interruptionsDuTrace(itin)).toEqual([])
  })

  it('situe le saut sur le même axe que la géométrie', () => {
    /*
      L'axe est celui d'`itineraryCoords` : les deux sortent de la même
      boucle, précisément pour qu'un décalage d'un point ne puisse pas placer
      une interruption à côté de là où elle est (§4ter).
    */
    const premier = straightLine(4.5, 45.4, 1_000, 10)
    const dernier = premier[premier.length - 1] as [number, number]
    // Second tronçon décalé de ~1 km à l'est du premier : un vrai trou.
    const second = straightLine(dernier[0] + 0.0128, 45.4, 500, 5)
    const itin = makeItinerary(2, [
      { osmWayId: 10, coords: premier },
      { osmWayId: 20, coords: second },
    ])

    const [saut] = interruptionsDuTrace(itin)
    expect(saut).toBeDefined()
    expect(saut?.debutMetres).toBeCloseTo(1_000, -1)
    expect((saut?.finMetres ?? 0) - (saut?.debutMetres ?? 0)).toBeGreaterThan(
      900,
    )
  })

  it('ignore un écart sous le seuil : c’est de la saisie, pas un trou', () => {
    // Le même seuil que celui des trous annoncés sur la fiche — importé de
    // `chainage.ts`, pas recopié. Vingt mètres entre deux extrémités, c'est
    // le même point saisi deux fois.
    const premier = straightLine(4.5, 45.4, 1_000, 10)
    const dernier = premier[premier.length - 1] as [number, number]
    const second = straightLine(dernier[0] + 0.00025, 45.4, 500, 5)
    const itin = makeItinerary(3, [
      { osmWayId: 10, coords: premier },
      { osmWayId: 20, coords: second },
    ])
    expect(interruptionsDuTrace(itin)).toEqual([])
  })
})
