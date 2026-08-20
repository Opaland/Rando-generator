import type { Itinerary, LonLat, Track } from './types.ts'

/**
 * Sorties faites hors de la zone chargée.
 *
 * L'historique additionne toutes les traces ; le tableau de bord ne compte
 * que ce qui recoupe les itinéraires téléchargés. Les deux chiffres sont
 * justes, et leur écart n'était expliqué nulle part : quelqu'un qui rentre de
 * Bretagne avec le Pilat chargé voit ses kilomètres d'un côté et un
 * pourcentage inchangé de l'autre (issue #133).
 *
 * On ne corrige pas le calcul — il est bon —, on nomme l'écart.
 */

/**
 * Marge autour du cadre des tracés chargés (~1 km). Sur le terrain c'est le
 * même massif : le hasard du cadrage ne doit pas décider qu'une sortie est
 * « ailleurs » pour cent mètres.
 */
const MARGE_DEG = 0.01

interface Cadre {
  ouest: number
  est: number
  sud: number
  nord: number
}

function cadreDe(itineraries: Itinerary[]): Cadre | null {
  let ouest = Infinity
  let est = -Infinity
  let sud = Infinity
  let nord = -Infinity
  for (const itin of itineraries) {
    for (const way of itin.ways) {
      for (const [lon, lat] of way.coords) {
        ouest = Math.min(ouest, lon)
        est = Math.max(est, lon)
        sud = Math.min(sud, lat)
        nord = Math.max(nord, lat)
      }
    }
  }
  if (!Number.isFinite(ouest)) return null
  return {
    ouest: ouest - MARGE_DEG,
    est: est + MARGE_DEG,
    sud: sud - MARGE_DEG,
    nord: nord + MARGE_DEG,
  }
}

function dansLeCadre(point: LonLat, cadre: Cadre): boolean {
  return (
    point[0] >= cadre.ouest &&
    point[0] <= cadre.est &&
    point[1] >= cadre.sud &&
    point[1] <= cadre.nord
  )
}

/**
 * Traces dont **aucun** point ne tombe dans le cadre des itinéraires chargés.
 *
 * Une traversée qui commence ailleurs et entre dans la zone n'est pas
 * « hors zone » : une partie de ses kilomètres peut compter.
 */
export function tracesHorsZone(
  tracks: Track[],
  itineraries: Itinerary[],
): Track[] {
  const cadre = cadreDe(itineraries)
  // Sans zone chargée, il n'y a pas de « hors zone » : l'utilisateur n'a pas
  // encore choisi de périmètre.
  if (!cadre) return []
  return tracks.filter(
    (track) =>
      track.points.length > 0 &&
      !track.points.some((point) => dansLeCadre(point, cadre)),
  )
}
