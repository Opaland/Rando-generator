import { describe, it, expect } from 'vitest'
import {
  buildRoutingGraph,
  clefsBouclees,
  findPath,
  graphSize,
  nodeKey,
  routeThrough,
  snapToNetwork,
  type RoutingGraph,
} from '../../src/core/routing.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import { CELL_SIZE_DEG, type Itinerary, type LonLat, type TrailWay } from '../../src/core/types.ts'

/**
 * Le tracé dessiné, là où la vague de mutation du 19/10 l'a trouvé sans
 * test.
 *
 * 39 survivants et 9 lignes jamais exécutées sur `core/routing.ts`, presque
 * tous dans le tas binaire de Dijkstra. Les 9 lignes : la comparaison des
 * deux enfants d'un nœud du tas, qu'on n'atteint qu'avec trois éléments et
 * plus — aucun test n'en faisait grossir un jusque-là. Aucun ne vérifiait
 * non plus que le chemin rendu est le plus court quand deux existent.
 *
 * Le contrôle principal compare `findPath` à un Dijkstra de référence,
 * écrit ici sans tas (un balayage linéaire), sur un graphe pseudo-aléatoire :
 * une erreur d'ordre dans le tas finit tôt ou tard par rendre un chemin plus
 * long, et la référence le voit.
 */

const M_LON = 78_710
const M_LAT = 111_320

function itineraire(ways: TrailWay[]): Itinerary {
  return { osmRelationId: 1, ref: null, name: 'réseau', network: 'PR', ways, totalMeters: 0, fetchedAt: '' }
}

function longueur(chemin: LonLat[]): number {
  let d = 0
  for (let i = 1; i < chemin.length; i++) d += distanceMeters(chemin[i - 1] as LonLat, chemin[i] as LonLat)
  return d
}

/** Dijkstra de référence, sans tas : à chaque tour, le plus proche non fixé. */
function distanceDeReference(graph: RoutingGraph, depart: string, arrivee: string): number {
  const dist = new Map<string, number>([[depart, 0]])
  const fixes = new Set<string>()
  for (;;) {
    let courant: string | null = null
    for (const [cle, d] of dist) {
      if (fixes.has(cle)) continue
      if (courant === null || d < (dist.get(courant) as number)) courant = cle
    }
    if (courant === null) return Infinity
    if (courant === arrivee) return dist.get(courant) as number
    fixes.add(courant)
    for (const arete of graph.edges.get(courant) ?? []) {
      const candidat = (dist.get(courant) as number) + arete.meters
      if (candidat < (dist.get(arete.to) ?? Infinity)) dist.set(arete.to, candidat)
    }
  }
}

/** Un générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(graine: number): () => number {
  let a = graine
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('findPath rend le plus court chemin', () => {
  it('ne fixe pas un sommet intermédiaire avant d’avoir trouvé sa meilleure route', () => {
    /*
      Vers X, deux routes : S → A → X par un crochet (≈ 944 m), et
      S → B → C → X en ligne droite (500 m) ; puis X → T, 100 m. Une file
      qui ne trierait pas par distance fixerait X par A — premier arrivé —,
      en partirait vers T, et ignorerait ensuite la route droite, X étant
      déjà fixé : 1 044 m au lieu de 600.
    */
    const pt = (x: number, y: number): LonLat => [5.7 + x / M_LON, 45.1 + y / M_LAT]
    const [S, A, B, C, X, T] = [pt(0, 0), pt(250, 400), pt(166, 0), pt(333, 0), pt(500, 0), pt(600, 0)]
    const graph = buildRoutingGraph([
      itineraire([
        { osmWayId: 1, coords: [S, A, X] },
        { osmWayId: 2, coords: [S, B, C, X] },
        { osmWayId: 3, coords: [X, T] },
      ]),
    ])
    const chemin = findPath(graph, nodeKey(...S), nodeKey(...T))
    expect(chemin).toEqual([S, B, C, X, T])
  })

  it.each([1, 2, 3, 4, 5])('sur un réseau pseudo-aléatoire (graine %d), la même distance qu’une référence sans tas', (graine) => {
    const tirer = aleatoire(graine)
    // Une grille de 8 × 8 sommets jitterés, dont on garde une arête sur
    // deux environ : des chemins multiples, des longueurs toutes différentes.
    const sommets: LonLat[][] = Array.from({ length: 8 }, (_, i) =>
      Array.from({ length: 8 }, (_, j): LonLat => [5.7 + (i * 200 + tirer() * 120) / M_LON, 45.1 + (j * 200 + tirer() * 120) / M_LAT]),
    )
    const ways: TrailWay[] = []
    let id = 1
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const ici = sommets[i]?.[j] as LonLat
        if (i < 7 && tirer() < 0.7) ways.push({ osmWayId: id++, coords: [ici, sommets[i + 1]?.[j] as LonLat] })
        if (j < 7 && tirer() < 0.7) ways.push({ osmWayId: id++, coords: [ici, sommets[i]?.[j + 1] as LonLat] })
      }
    }
    const graph = buildRoutingGraph([itineraire(ways)])
    const depart = nodeKey(...(sommets[0]?.[0] as LonLat))
    const arrivee = nodeKey(...(sommets[7]?.[7] as LonLat))
    const reference = distanceDeReference(graph, depart, arrivee)
    const chemin = findPath(graph, depart, arrivee)
    if (reference === Infinity) expect(chemin).toBeNull()
    else expect(longueur(chemin as LonLat[])).toBeCloseTo(reference, 6)
  })
})

describe('findPath sur cent réseaux géométriques aléatoires', () => {
  /*
    Les grilles du bloc précédent ont des arêtes de longueurs voisines : un
    tas mal ordonné y retombe presque toujours sur la bonne distance. Ici,
    40 sommets semés au hasard, reliés chacun à ses trois plus proches
    voisins, plus quelques longues traverses : des routes de longueurs très
    différentes vers un même sommet, ce qui fait payer tout désordre du tas.
  */
  it('rendent tous la distance de la référence', () => {
    for (let graine = 1; graine <= 100; graine++) {
      const tirer = aleatoire(graine)
      const points = Array.from({ length: 40 }, (): LonLat => [5.7 + (tirer() * 2_000) / M_LON, 45.1 + (tirer() * 2_000) / M_LAT])
      const ways: TrailWay[] = []
      let id = 1
      for (const [i, p] of points.entries()) {
        const voisins = points
          .map((q, j) => ({ j, d: distanceMeters(p, q) }))
          .filter((v) => v.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
        for (const v of voisins) ways.push({ osmWayId: id++, coords: [p, points[v.j] as LonLat] })
      }
      for (let k = 0; k < 8; k++) {
        const a = points[Math.floor(tirer() * 40)] as LonLat
        const b = points[Math.floor(tirer() * 40)] as LonLat
        ways.push({ osmWayId: id++, coords: [a, b] })
      }
      const graph = buildRoutingGraph([itineraire(ways)])
      const depart = nodeKey(...(points[0] as LonLat))
      const arrivee = nodeKey(...(points[39] as LonLat))
      const reference = distanceDeReference(graph, depart, arrivee)
      const chemin = findPath(graph, depart, arrivee)
      if (reference === Infinity) expect(chemin, `graine ${String(graine)}`).toBeNull()
      else expect(longueur(chemin as LonLat[]), `graine ${String(graine)}`).toBeCloseTo(reference, 6)
    }
  })
})

describe('snapToNetwork', () => {
  const ici: LonLat = [5.7, 45.1]
  const graphe = (point: LonLat) => buildRoutingGraph([itineraire([{ osmWayId: 1, coords: [point, [point[0] + 0.01, point[1]]] }])])

  it('trouve un sommet à 300 m quand on lui en accorde 500', () => {
    const loin: LonLat = [ici[0], ici[1] + 300 / M_LAT]
    expect(snapToNetwork(graphe(loin), ici, 500)).toBe(nodeKey(...loin))
  })

  it.each([
    ['à l’est', [ici[0] + 120 / M_LON, ici[1]] as LonLat],
    ['au nord', [ici[0], ici[1] + 120 / M_LAT] as LonLat],
  ])('trouve un sommet %s, au bord de son rayon', (_cote, point) => {
    // Un sommet à 120 m, la tolérance par défaut à 150 m : il tombe dans la
    // cellule voisine, à l'est ou au nord.
    const graph = buildRoutingGraph([itineraire([{ osmWayId: 1, coords: [point, [point[0], point[1] + 0.01]] }])])
    expect(snapToNetwork(graph, ici)).toBe(nodeKey(...point))
  })
})

describe('snapToNetwork, au bout de son balayage', () => {
  it('trouve un sommet deux colonnes plus à l’est, encore sous la tolérance', () => {
    /*
      Une colonne de la grille fait 118 m de large à 45°, et le rayon de
      150 m en balaie deux. Le clic au bord est de sa colonne, le sommet
      juste après le bord ouest de la colonne +2 : 121 m, à trouver.
    */
    const bord = 3001 * CELL_SIZE_DEG
    const clic: LonLat = [bord - 0.00002, 45.1]
    const sommet: LonLat = [bord + CELL_SIZE_DEG + 0.00002, 45.1]
    const graph = buildRoutingGraph([itineraire([{ osmWayId: 1, coords: [sommet, [sommet[0] + 0.01, 45.1]] }])])
    expect(snapToNetwork(graph, clic)).toBe(nodeKey(...sommet))
  })
})

describe('le reste', () => {
  it('compte les arêtes dans les deux sens', () => {
    const graph = buildRoutingGraph([itineraire([{ osmWayId: 1, coords: [[5.7, 45.1], [5.71, 45.1], [5.72, 45.1]] }])])
    expect(graphSize(graph)).toEqual({ nodes: 3, edges: 4 })
  })

  it('refuse un enchaînement qui part d’un sommet inconnu', () => {
    const graph = buildRoutingGraph([])
    expect(routeThrough(graph, ['inconnu'])).toBeNull()
  })

  it('ne boucle pas un tracé de deux points', () => {
    // Revenir au départ depuis le seul autre point, c'est un aller-retour,
    // pas une boucle.
    expect(clefsBouclees(['a', 'b'])).toEqual(['a', 'b'])
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `dy <= radius` en `dy < radius` dans `snapToNetwork` : le rayon est
    compté en cellules de 100 m, mais une rangée en fait 167 — la dernière
    rangée balayée est toujours au-delà de la tolérance. En longitude
    (118 m), la dernière colonne compte, et le cas ci-dessus le garde ;
  - `cx − dx`, `cy − dy` (boucles symétriques), `distance <= best` en `<`
    (égalité exacte), `if (!coord)` (l'index ne connaît que des sommets du
    graphe) ;
  - le tas : `parent <= distance` en `<` échange deux éléments de même
    distance ; le tas démarré avec un élément parasite le dépile sans clé
    et sans arête, sans rien relâcher ;
  - les gardes de `findPath` : sommet inconnu, départ égal à l'arrivée,
    distances initiales, `queue.size >= 0`, `!current`, `settled.has`
    (deux fois), `current.key === toKey`, `if (coord)`, `cursor === fromKey`
    — chacune rendue par la suite de l'algorithme (un sommet sans arête
    n'atteint rien, la remontée s'arrête faute de prédécesseur, un sommet
    déjà fixé ne s'améliore plus) ;
  - `clefsBouclees` avec `keys.length < 3` en `false` : pour deux clés, le
    test ci-dessus le tue ; pour une ou zéro, `premier` répété rend la même
    liste qu'un départ seul ;
  - `way.coords.length < 2` dans `buildRoutingGraph` : la boucle sur les
    segments ne tourne pas.
*/
