import { distanceToSegmentMeters } from './geo.ts'
import { estUnCouchage } from './couchage.ts'
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
 * **Ce module a longtemps affirmé que rien n'était écarté**, et le justifiait :
 * « un sommet à deux kilomètres est un détour que certains feront et d'autres
 * non ; le masquer déciderait à leur place ». L'argument était juste pour *un*
 * sommet. Le 25/08, Cédric a relevé **quarante-quatre points sur une boucle de
 * 8,6 km, dont un à 4,2 km de détour** — et sept sur un itinéraire de 500 m,
 * dont un à 3,4 km.
 *
 * Une liste qu'on ne peut pas lire ne laisse personne décider de rien : le
 * commentaire défendait une liberté que la longueur avait déjà retirée. C'est
 * le §4bis dans sa forme la plus banale — une justification qui n'était pas
 * fausse quand elle a été écrite, et que personne ne relit.
 *
 * Ce qui subsiste de l'argument, et qui compte : **on ne jette rien**.
 * `poisDuChemin` partage la liste en deux au lieu de la tronquer, pour que la
 * fiche puisse dire combien elle a mis de côté. Le rayon règle la lisibilité,
 * il ne doit pas coûter la franchise.
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

/**
 * Le détour au-delà duquel un point n'est plus « sur le chemin » (issue #318).
 *
 * **Tranché par Cédric le 25/08**, en regardant les fiches : un kilomètre de
 * détour — c'est-à-dire cinq cents mètres d'écart au tracé, puisque le détour
 * est un aller-retour. Ce n'est pas un nombre que le code a mesuré, c'est une
 * décision de produit, et elle est écrite ici plutôt que dissimulée dans une
 * condition (§2).
 *
 * Ce n'est pas non plus le rayon de la *recherche* : `core/poi` interroge
 * Overpass sur des boîtes de 0,015° de marge, soit près d'un kilomètre et demi
 * de chaque côté, et une boîte a des coins plus lointains que ses côtés. C'est
 * pour ça que le filtre est ici, sur une distance mesurée à la polyligne, et
 * non là-bas sur une boîte.
 */
export const DETOUR_MAX_METRES = 1_000

export interface PoisDuChemin {
  /** Ce qui est à portée — ou ce qui vaut le détour quoi qu'il en coûte. */
  retenus: PoiSitue[]
  /** Le reste, gardé pour pouvoir le dire, pas pour l'afficher. */
  ecartes: PoiSitue[]
}

/**
 * Partage les points situés entre ceux qui sont sur le chemin et les autres.
 *
 * L'exception est l'hébergement, et elle n'est pas une tolérance : un refuge à
 * quatre kilomètres est une décision d'étape, pas un détour d'agrément. Le
 * masquer ferait planifier une nuit dehors à quelqu'un qui avait un toit à une
 * heure de marche. La question « peut-on y dormir » est posée une seule fois
 * dans le dépôt, par `estUnCouchage` — c'est la même que celle du découpage en
 * étapes, et deux listes qui disent la même règle ont le même trou (§4ter).
 *
 * L'ordre reçu est conservé des deux côtés : `situerPois` a déjà trié du plus
 * proche au plus lointain, et le retrier ici serait la seconde façon de
 * calculer la même chose.
 */
export function poisDuChemin(situes: PoiSitue[]): PoisDuChemin {
  const retenus: PoiSitue[] = []
  const ecartes: PoiSitue[] = []
  for (const poi of situes) {
    if (poi.detourMeters <= DETOUR_MAX_METRES || estUnCouchage(poi.kind)) {
      retenus.push(poi)
    } else {
      ecartes.push(poi)
    }
  }
  return { retenus, ecartes }
}
