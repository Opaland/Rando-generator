/**
 * Le chaînage des tronçons — **la** géométrie d'un itinéraire (issue #303).
 *
 * ## Pourquoi ce module existe séparément
 *
 * Ce code vivait dans `stages.ts`, et deux modules l'y appelaient : le
 * découpage en étapes et la mesure de qualité de la donnée. Pendant ce
 * temps, `mapdata.ts` concaténait les ways **dans l'ordre des membres**,
 * sous un commentaire qui affirmait que cet ordre « suit généralement le
 * sens de l'itinéraire ».
 *
 * Mesuré le 25/08 sur trois tronçons contigus donnés dans l'ordre
 * quelconque d'OpenStreetMap, l'un décrit à l'envers — le cas ordinaire :
 *
 * ```
 * ordre des membres = 10 931 m     chaînage = 4 685 m     écart 133 %
 * ```
 *
 * Le profil altimétrique pouvait annoncer 10,9 km là où l'itinéraire en fait
 * 4,7, et « fin d'étape 2 — km 22 » désigner un autre endroit que le km 22
 * du profil. Deux façons de dire « la longueur d'un itinéraire », deux
 * réponses, et rien qui le signale : le §4ter de CLAUDE.md.
 *
 * Il n'y a donc plus qu'une géométrie, et elle vit ici plutôt que dans
 * `stages.ts` — un module de bas niveau que `mapdata.ts` peut appeler sans
 * dépendre du découpage en étapes.
 */

import type { LonLat, TrailWay } from './types.ts'

/** Précision de regroupement des extrémités de tronçons (~1 m). */
const NODE_PRECISION_DEG = 1e-5

function nodeKey(point: LonLat): string {
  return `${Math.round(point[0] / NODE_PRECISION_DEG)},${Math.round(point[1] / NODE_PRECISION_DEG)}`
}

export interface Maillon {
  wayId: number
  reversed: boolean
  /** Premier point du tronçon, dans le sens de la marche. */
  start: LonLat
  /** Dernier point du tronçon, dans le sens de la marche. */
  end: LonLat
  /**
   * Vrai quand ce tronçon ne s'accroche pas au précédent : la relation est
   * trouée (ou ramifiée) et la chaîne repart d'ailleurs. C'est ce que
   * `core/dataQuality.ts` mesure pour prévenir l'utilisateur.
   */
  newPiece: boolean
}

/**
 * Remet les tronçons dans l'ordre du chemin. Les membres d'une relation OSM
 * ne sont pas toujours ordonnés, et un tronçon peut être décrit dans le sens
 * inverse de la marche. On part d'une extrémité libre quand il y en a une,
 * puis on enchaîne de proche en proche ; ce qui reste (relation trouée ou
 * ramifiée) est ajouté dans l'ordre donné, pour ne perdre aucun kilomètre.
 */
export function chainWays(ways: TrailWay[]): Maillon[] {
  const utilisables = ways.filter((w) => w.coords.length >= 2)
  if (utilisables.length === 0) return []

  const parNoeud = new Map<string, number[]>()
  utilisables.forEach((w, index) => {
    for (const extremite of [w.coords[0], w.coords[w.coords.length - 1]]) {
      if (!extremite) continue
      const cle = nodeKey(extremite)
      const liste = parNoeud.get(cle)
      if (liste) liste.push(index)
      else parNoeud.set(cle, [index])
    }
  })

  // Départ : une extrémité qui n'appartient qu'à un seul tronçon.
  let depart = 0
  let departInverse = false
  for (const [cle, indices] of parNoeud) {
    if (indices.length !== 1) continue
    const index = indices[0] as number
    const way = utilisables[index] as TrailWay
    depart = index
    departInverse = nodeKey(way.coords[way.coords.length - 1] as LonLat) === cle
    break
  }

  const utilise = new Set<number>()
  const chaine: Maillon[] = []

  const ajouter = (
    index: number,
    reversed: boolean,
    newPiece: boolean,
  ): LonLat => {
    const way = utilisables[index] as TrailWay
    utilise.add(index)
    const premier = way.coords[0] as LonLat
    const dernier = way.coords[way.coords.length - 1] as LonLat
    chaine.push({
      wayId: way.osmWayId,
      reversed,
      start: reversed ? dernier : premier,
      end: reversed ? premier : dernier,
      newPiece,
    })
    return reversed ? premier : dernier
  }

  let fin = ajouter(depart, departInverse, true)
  while (utilise.size < utilisables.length) {
    const candidats = parNoeud.get(nodeKey(fin)) ?? []
    const suivant = candidats.find((i) => !utilise.has(i))
    if (suivant === undefined) {
      // Trou dans la relation : on reprend au premier tronçon non utilisé.
      const reste = utilisables.findIndex((_, i) => !utilise.has(i))
      if (reste < 0) break
      fin = ajouter(reste, false, true)
      continue
    }
    const way = utilisables[suivant] as TrailWay
    const reversed =
      nodeKey(way.coords[way.coords.length - 1] as LonLat) === nodeKey(fin)
    fin = ajouter(suivant, reversed, false)
  }
  return chaine
}
