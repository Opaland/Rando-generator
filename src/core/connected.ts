import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary, LonLat, Sample } from './types.ts'

/**
 * Plus grand enchaînement parcouru d'un seul tenant.
 *
 * Le pourcentage dit combien on a fait ; il ne dit pas si on l'a fait à la
 * suite. « 40 km du GR 7 » et « 40 km du GR 7 d'affilée » ne racontent pas la
 * même sortie, et la seconde est la plus difficile — c'est celle qui mérite
 * d'être mesurée.
 *
 * L'enchaînement ne s'arrête pas à la frontière d'une relation OSM : sur le
 * terrain, deux itinéraires qui se touchent se marchent à la suite. Le calcul
 * porte donc sur tous les tronçons chargés, quelle que soit leur relation.
 *
 * Un tronçon ne compte que s'il est parcouru **en entier** : traverser un
 * sentier n'est pas le parcourir, et une composante bâtie sur des bouts de
 * chemins annoncerait un enchaînement qui n'a pas eu lieu.
 *
 * Deux tronçons sont réputés se toucher quand une de leurs **extrémités**
 * coïncide, à un mètre près. C'est l'hypothèse d'OpenStreetMap, où les ways
 * sont découpés aux intersections, et celle que fait déjà `core/stages`. Un
 * sentier qui en rejoindrait un autre en son milieu sans y être découpé
 * passerait donc pour déconnecté : le chiffre annoncé serait alors plus
 * prudent que la réalité, ce qui est le bon sens de l'erreur.
 */

/** Précision de regroupement des extrémités (~1 m), comme dans core/stages. */
const NODE_PRECISION_DEG = 1e-5

function nodeKey(point: LonLat): string {
  return `${Math.round(point[0] / NODE_PRECISION_DEG)},${Math.round(point[1] / NODE_PRECISION_DEG)}`
}

export interface WalkedRun {
  /** Longueur de l'enchaînement, en mètres. */
  meters: number
  /** Tronçons qui le composent, par identifiant OSM croissant. */
  wayIds: number[]
}

const VIDE: WalkedRun = { meters: 0, wayIds: [] }

/** Union-find sur les extrémités de tronçons, avec compression de chemin. */
class Unions {
  private readonly parents = new Map<string, string>()

  racine(cle: string): string {
    let courant = cle
    const chemin: string[] = []
    for (;;) {
      const parent = this.parents.get(courant)
      if (parent === undefined || parent === courant) break
      chemin.push(courant)
      courant = parent
    }
    this.parents.set(courant, courant)
    // Les chaînes de sentiers sont longues : sans compression, remonter
    // jusqu'à la racine coûterait un parcours complet à chaque tronçon.
    for (const etape of chemin) this.parents.set(etape, courant)
    return courant
  }

  unir(a: string, b: string): void {
    const ra = this.racine(a)
    const rb = this.racine(b)
    if (ra !== rb) this.parents.set(ra, rb)
  }
}

/** Un tronçon retenu, avec ses deux extrémités déjà extraites. */
interface Tronçon {
  wayId: number
  meters: number
  debut: string
  fin: string
}

export function largestWalkedRun(
  itineraries: Itinerary[],
  samples: Sample[],
): WalkedRun {
  if (itineraries.length === 0 || samples.length === 0) return VIDE

  // Un tronçon est parcouru quand aucun de ses échantillons ne manque.
  const complet = new Map<number, boolean>()
  for (const sample of samples) {
    const dejaVu = complet.get(sample.wayId)
    complet.set(sample.wayId, (dejaVu ?? true) && sample.done)
  }

  // Un way partagé par deux relations ne doit être compté qu'une fois.
  const parcourus = new Map<number, Tronçon>()
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      if (complet.get(way.osmWayId) !== true) continue
      const debut = way.coords[0]
      const fin = way.coords[way.coords.length - 1]
      if (!debut || !fin) continue
      parcourus.set(way.osmWayId, {
        wayId: way.osmWayId,
        meters: polylineLengthMeters(way.coords),
        debut: nodeKey(debut),
        fin: nodeKey(fin),
      })
    }
  }
  if (parcourus.size === 0) return VIDE

  const unions = new Unions()
  for (const tronçon of parcourus.values()) {
    unions.unir(tronçon.debut, tronçon.fin)
  }

  const composantes = new Map<string, WalkedRun>()
  for (const tronçon of parcourus.values()) {
    const racine = unions.racine(tronçon.debut)
    const composante = composantes.get(racine)
    if (composante) {
      composante.meters += tronçon.meters
      composante.wayIds.push(tronçon.wayId)
    } else {
      composantes.set(racine, {
        meters: tronçon.meters,
        wayIds: [tronçon.wayId],
      })
    }
  }

  let meilleure = VIDE
  for (const composante of composantes.values()) {
    if (composante.meters > meilleure.meters) meilleure = composante
  }
  return { meters: meilleure.meters, wayIds: [...meilleure.wayIds].sort((a, b) => a - b) }
}
