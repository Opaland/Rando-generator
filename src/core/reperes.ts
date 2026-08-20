import { distanceMeters } from './geo.ts'
import type {
  ElevationProfile,
  PoiKind,
  PointOfInterest,
} from './types.ts'

/**
 * Repères nommés le long du profil altimétrique.
 *
 * En montagne, un itinéraire se raconte par ses cols : c'est là qu'on
 * bascule, qu'on souffle, qu'on décide de continuer ou de redescendre. Un
 * profil alpin sans nom de col est une courbe sans repère — on voit qu'on
 * monte de 900 mètres, on ne sait pas vers quoi.
 */

/**
 * Au-delà, un point ne jalonne plus le tracé : l'y placer raconterait une
 * montée qu'on ne fait pas. Plus strict que le détour affiché dans la liste
 * des POI, parce qu'ici le repère prétend être *sur* le chemin.
 */
export const REPERE_MAX_METERS = 250

/**
 * Ce qui structure une journée de marche. Un point de vue ou une source
 * méritent d'être listés, pas d'encombrer une courbe qui doit se lire d'un
 * coup d'œil.
 */
const KINDS_REPERES: PoiKind[] = ['pass', 'peak', 'hut', 'bivouac']

export interface Repere {
  id: string
  name: string
  kind: PoiKind
  /** Distance depuis le départ, en mètres. */
  distanceMeters: number
  /** Altitude, taguée si elle l'est, sinon celle du profil. */
  elevation: number | null
}

export function reperesDuProfil(
  profile: ElevationProfile,
  pois: PointOfInterest[],
): Repere[] {
  const { coords, distances, elevations } = profile
  if (coords.length === 0) return []

  const reperes: Repere[] = []
  for (const poi of pois) {
    if (!poi.name || !KINDS_REPERES.includes(poi.kind)) continue

    // Le point du profil le plus proche : le profil échantillonne le tracé,
    // c'est donc lui qui donne la position le long du chemin.
    let meilleur = 0
    let minimum = Number.POSITIVE_INFINITY
    for (const [index, point] of coords.entries()) {
      const distance = distanceMeters([poi.lon, poi.lat], point)
      if (distance < minimum) {
        minimum = distance
        meilleur = index
      }
    }
    if (minimum > REPERE_MAX_METERS) continue

    // `Number(null)` vaut zéro : sans ce garde, un col sans altitude taguée
    // se retrouverait au niveau de la mer.
    const tague = poi.details.elevation ? Number(poi.details.elevation) : NaN
    reperes.push({
      id: poi.id,
      name: poi.name,
      kind: poi.kind,
      distanceMeters: distances[meilleur] ?? 0,
      elevation: Number.isFinite(tague) ? tague : (elevations[meilleur] ?? null),
    })
  }
  return reperes.sort((a, b) => a.distanceMeters - b.distanceMeters)
}
