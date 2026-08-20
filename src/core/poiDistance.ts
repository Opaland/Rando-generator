import { distanceToSegmentMeters } from './geo.ts'
import type { LonLat, PointOfInterest } from './types.ts'

/**
 * Situe les points d'intérêt par rapport au tracé.
 *
 * Les POI sont cherchés par boîtes englobantes larges de plusieurs
 * kilomètres (`core/poi`) : « le long de l'itinéraire » ne veut rien dire
 * tant qu'on n'a pas mesuré. Une source affichée sans distance laisse croire
 * à une proximité que personne n'a vérifiée — et sur le terrain, c'est une
 * décision qui en dépend.
 *
 * Ce qui est rendu n'est pas seulement la distance mais le **détour** : un
 * aller-retour. C'est ce que le point coûte à celui qui marche, et non pas où
 * il se trouve.
 *
 * Rien n'est écarté. Un sommet à deux kilomètres du sentier est un détour que
 * certains feront et d'autres non ; le masquer déciderait à leur place, alors
 * qu'afficher « 4,4 km de détour » leur donne de quoi trancher. C'est la même
 * règle que pour les relations trouées : on ne corrige pas la donnée, on dit
 * ce qu'elle vaut.
 */

export interface PoiSitue extends PointOfInterest {
  /** Distance au point le plus proche du tracé, en mètres. */
  distanceMeters: number
  /** Coût réel : l'aller-retour depuis le tracé. */
  detourMeters: number
}

/**
 * Distance d'un point à une polyligne, mesurée sur les segments — pas
 * seulement sur les sommets : un tracé décrit par deux points éloignés passe
 * pourtant bien entre les deux.
 */
function distanceAuTrace(
  point: LonLat,
  premier: LonLat,
  suite: LonLat[],
): number {
  let precedent = premier
  // Un tracé d'un seul point reste mesurable : le segment est dégénéré.
  let minimum = distanceToSegmentMeters(point, premier, premier)
  for (const courant of suite) {
    minimum = Math.min(
      minimum,
      distanceToSegmentMeters(point, precedent, courant),
    )
    precedent = courant
  }
  return minimum
}

export function situerPois(
  pois: PointOfInterest[],
  trace: LonLat[],
): PoiSitue[] {
  const [premier, ...suite] = trace
  if (!premier) return []
  return pois
    .map((poi) => {
      const distanceMeters = distanceAuTrace([poi.lon, poi.lat], premier, suite)
      return { ...poi, distanceMeters, detourMeters: distanceMeters * 2 }
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
}
