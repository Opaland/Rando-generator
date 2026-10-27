import { RAYON_AUTOUR_METERS } from './overpass.ts'
import type { LonLat } from './types.ts'

/**
 * Une recherche « autour d'un lieu » qui s'élargit quand elle ne trouve
 * rien (#591).
 *
 * Mesuré le 22/10 autour de Nouméa, même requête, même centre : 0 relation
 * à 12 km, 8 à 20 km, 13 à 30 km. Tranché par Cédric le 27/10 : 12 km
 * d'abord, 25 km seulement si rien n'est trouvé, et l'écran le dit. 25 km
 * est la valeur proposée et retenue ce jour-là, entre les deux mesures — un
 * choix, pas une mesure (§2). Une ville de métropole ne change donc rien :
 * la requête de plus n'a lieu que là où il n'y avait rien.
 */
export const RAYON_ELARGI_METERS = 25_000

/**
 * Le rayon de la tentative suivante, ou `null` s'il n'y en a pas.
 *
 * `trouves` vaut `null` quand le chargement n'a pas abouti — annulé, ou
 * serveurs injoignables : on ne sait alors pas qu'il n'y a rien, et élargir
 * relancerait une requête sur une panne.
 */
export function rayonSuivant(rayon: number, trouves: number | null): number | null {
  if (trouves !== 0) return null
  return rayon < RAYON_ELARGI_METERS ? RAYON_ELARGI_METERS : null
}

/**
 * La clé de zone : `autour:<lon>,<lat>`, plus `,<rayon>` s'il a été élargi.
 *
 * La forme courte est celle des clés déjà en base : elle doit se relire telle
 * quelle, au rayon d'origine.
 */
export function cleAutour(center: LonLat, rayon: number): string {
  const [lon, lat] = center
  const base = `autour:${lon.toFixed(4)},${lat.toFixed(4)}`
  return rayon === RAYON_AUTOUR_METERS ? base : `${base},${String(rayon)}`
}

/**
 * Relit une clé « autour », ou `null` si elle est abîmée.
 *
 * Relue au démarrage, elle vient du stockage et peut être tronquée : mieux
 * vaut ne rien charger qu'un centre `[NaN, 45.75]` (voir
 * `rafraichirZone.test.ts`). Nommée pour servir au cadrage comme à
 * l'actualisation (§4) : les deux la lisaient chacun de leur côté.
 */
export function lireCleAutour(cle: string): { center: LonLat; rayon: number } | null {
  if (!cle.startsWith('autour:')) return null
  const parts = cle.slice('autour:'.length).split(',').map(Number)
  if (parts.length !== 2 && parts.length !== 3) return null
  const [lon, lat, rayon = RAYON_AUTOUR_METERS] = parts as [number, number, number?]
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (!Number.isFinite(rayon) || rayon <= 0) return null
  return { center: [lon, lat], rayon }
}

/** « Autour de Nouméa », et « …, élargi à 25 km » quand il l'a été. */
export function libelleAutour(nom: string, rayon: number): string {
  const base = `Autour de ${nom}`
  return rayon === RAYON_AUTOUR_METERS
    ? base
    : `${base}, élargi à ${String(Math.round(rayon / 1000))} km`
}

/** Le nom du lieu, relu dans le libellé de la zone pour l'actualiser. */
export function nomDuLieuAutour(libelle: string | null): string {
  return (libelle ?? '').replace(/^Autour de /, '').replace(/, élargi à \d+ km$/, '')
}
