import { EARTH_RADIUS_METERS } from './geo.ts'
import { lireCleAutour } from './rechercheAutour.ts'
import { EMPRISES_DE_ZONE } from './emprisesDeZone.donnees.ts'

/** Boîte englobante, en degrés : [ouest, sud, est, nord]. */
export type Emprise = readonly [number, number, number, number]

/**
 * Ce sur quoi la carte cadre quand une zone est chargée (#578).
 *
 * Cadrer sur les itinéraires reçus emportait la zone avec eux : un GR de
 * grande traversée qui passe par l'Isère y est rapporté en entier, et la
 * carte montrait la moitié de la France. Décision de Cédric du 22/10 : on
 * cadre sur l'emprise de la zone administrative elle-même.
 *
 * - zone prédéfinie : l'emprise de sa limite OSM, embarquée
 *   (`scripts/emprises-de-zone.mjs`) — aucune requête de plus ;
 * - « autour de » : la boîte du cercle interrogé, qui est la zone — au
 *   rayon élargi quand la recherche l'a été (#591) ;
 * - recherche par ref, ou rien de chargé : `null`. Là, l'itinéraire est la
 *   zone, et cadrer sur lui reste juste.
 */
export function empriseACadrer(zoneKey: string | null): Emprise | null {
  if (zoneKey === null) return null
  const embarquee = EMPRISES_DE_ZONE[zoneKey]
  if (embarquee !== undefined) return embarquee
  // Le cercle interrogé, rayon élargi compris (#591).
  const autour = lireCleAutour(zoneKey)
  if (autour === null) return null
  const [lon, lat] = autour.center
  return empriseDuCercle(lon, lat, autour.rayon)
}

function empriseDuCercle(lon: number, lat: number, rayon: number): Emprise {
  const dLat = (rayon / EARTH_RADIUS_METERS) * (180 / Math.PI)
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}
