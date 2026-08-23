import { formatAnciennete } from '../lib/format.ts'
import type { PointOfInterest } from './types.ts'

/**
 * Les points d'intérêt emportés (issue #153, quatrième pierre).
 *
 * Overpass répond en `POST`, et le Cache API ne sait pas ranger une requête
 * `POST` : les POI ne peuvent pas suivre le chemin des tuiles et du relief.
 * Ils passent par IndexedDB, et ce détour technique change la question de
 * fond.
 *
 * Une tuile périmée reste une tuile juste : le relief ne bouge pas. Un point
 * d'eau, si — il peut avoir été supprimé d'OpenStreetMap, ou tari. Servir un
 * POI emporté il y a trois mois **sans le dire** serait exactement la
 * promesse que le service worker refuse de faire depuis toujours (« un
 * relief ou des POI périmés ne valent pas mieux qu'un message clair »).
 *
 * D'où la règle de ce module : on sert la réserve, et on dit d'où elle vient
 * et de quand elle date.
 */

/** Ce qu'on a mis de côté pour un itinéraire, et quand. */
export interface PoisEmportes {
  itineraryId: number
  pois: PointOfInterest[]
  /** Instant ISO du téléchargement. */
  recuperesLe: string
}

export type SourcePois = 'reseau' | 'emporte' | 'aucune'

export interface ResultatPois {
  pois: PointOfInterest[]
  source: SourcePois
  /** Date de l'emport, quand c'est de là que viennent les points. */
  recuperesLe: string | null
}

/**
 * Que montrer : ce que le réseau vient de dire, ou ce qu'on avait emporté.
 *
 * `reseau` vaut `null` quand la requête a échoué, et `[]` quand elle a
 * abouti sans rien trouver. Cette distinction porte tout le module :
 * confondre les deux ferait passer une panne de réseau pour un désert, et
 * priverait de sa réserve quelqu'un qui l'a justement constituée pour ce
 * moment-là.
 */
export function choisirPois(
  reseau: PointOfInterest[] | null,
  emportes: PoisEmportes | null,
): ResultatPois {
  if (reseau !== null) {
    return { pois: reseau, source: 'reseau', recuperesLe: null }
  }
  if (emportes && emportes.pois.length > 0) {
    return {
      pois: emportes.pois,
      source: 'emporte',
      recuperesLe: emportes.recuperesLe,
    }
  }
  return { pois: [], source: 'aucune', recuperesLe: null }
}

/** Ce qu'il faut dire quand les points viennent de la réserve, sinon `null`. */
export function mentionPoisEmportes(
  resultat: ResultatPois,
  maintenant: Date,
): string | null {
  if (resultat.source !== 'emporte' || resultat.recuperesLe === null) return null
  const pris = new Date(resultat.recuperesLe)
  const jours = Math.round(
    (maintenant.getTime() - pris.getTime()) / (24 * 3600 * 1000),
  )
  const anciennete = formatAnciennete(jours)
  const quand =
    jours === 0
      ? `Emportés ${anciennete}`
      : `Emportés le ${pris.toLocaleDateString('fr-FR')}, ${anciennete}`
  return `${quand}. Un point d’eau peut avoir été supprimé ou tari depuis.`
}
