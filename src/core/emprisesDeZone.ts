import { EARTH_RADIUS_METERS } from './geo.ts'
import { RAYON_AUTOUR_METERS } from './overpass.ts'
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
 * - « autour de » : la boîte du cercle interrogé, qui est la zone ;
 * - recherche par ref, ou rien de chargé : `null`. Là, l'itinéraire est la
 *   zone, et cadrer sur lui reste juste.
 */
export function empriseACadrer(zoneKey: string | null): Emprise | null {
  if (zoneKey === null) return null
  const embarquee = EMPRISES_DE_ZONE[zoneKey]
  if (embarquee !== undefined) return embarquee
  if (zoneKey.startsWith('autour:')) {
    const parts = zoneKey.slice('autour:'.length).split(',').map(Number)
    if (parts.length !== 2) return null
    const [lon, lat] = parts as [number, number]
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    return empriseDuCercle(lon, lat, RAYON_AUTOUR_METERS)
  }
  return null
}

function empriseDuCercle(lon: number, lat: number, rayon: number): Emprise {
  const dLat = (rayon / EARTH_RADIUS_METERS) * (180 / Math.PI)
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}
