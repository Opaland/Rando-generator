import { trackDistanceMeters } from './history.ts'
import { lieuxDeLaTrace, type ContoursDeZone } from './lieuxDeTrace.ts'
import { MAX_ITINERAIRES_DE_SORTIE, type OutingHighlight } from './outing.ts'
import { moisLocal } from './valeurLue.ts'
import type { Itinerary, Track } from './types.ts'

/**
 * Les faits du récit d'une sortie (issue #673, deuxième usage).
 *
 * Même règle que `faitsDeSaison` : ce module calcule chaque nombre que Claude
 * aura le droit d'écrire, et l'objet rendu est exactement ce qui part,
 * montré avant l'envoi. N'en font jamais partie :
 *
 * - les coordonnées et la géométrie ;
 * - le nom du fichier, choisi par l'utilisateur ;
 * - le jour : le mois suffit à un récit, et un jour précis daterait une
 *   absence du domicile ;
 * - un itinéraire du réseau `PERSO` — créé ou importé par l'utilisateur, son
 *   nom est le sien (« Boucle de la cabane de Mamie ») ; seuls les réseaux
 *   publics (OSM, open data) sont nommés.
 *
 * Les itinéraires avancés viennent d'`outingHighlights`, déjà affichés dans
 * la fiche de la sortie : le récit ne recalcule rien de son côté (§4ter).
 */

export interface FaitsDeSortie {
  /** « juin 2026 », ou `null` pour une sortie sans date. */
  mois: string | null
  km: number
  deniveleM: number | null
  itineraires: { nom: string; kmParcourus: number; pctDeLItineraire: number }[]
  /**
   * La sortie a aussi avancé des itinéraires qui ne sont pas nommés ici :
   * personnels (jamais envoyés), ou au-delà des cinq que garde la fiche.
   * Sans nom ni nombre ; il interdit seulement d'écrire « aucun » (relecture
   * adverse du 12/11).
   */
  autresItinerairesNonNommes: boolean
  zones: string[]
}

const MOIS_ET_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const unDecimal = (x: number): number => Math.round(x * 10) / 10

export function faitsDeSortie(
  track: Track,
  avances: readonly OutingHighlight[],
  itineraires: readonly Itinerary[],
  contours?: ContoursDeZone | null,
): FaitsDeSortie {
  const mois = moisLocal(track.date)
  const publics = new Set(
    itineraires.filter((i) => i.network !== 'PERSO').map((i) => i.osmRelationId),
  )
  const nommes = avances.filter((a) => publics.has(a.itineraryId))
  return {
    mois: mois === null ? null : MOIS_ET_ANNEE.format(new Date(`${mois}-01T00:00:00Z`)),
    km: unDecimal(trackDistanceMeters(track) / 1000),
    deniveleM: typeof track.elevationGain === 'number' ? Math.round(track.elevationGain) : null,
    itineraires: nommes.map((a) => ({
      nom: a.name,
      kmParcourus: unDecimal(a.doneMeters / 1000),
      pctDeLItineraire: unDecimal(a.pct),
    })),
    autresItinerairesNonNommes:
      nommes.length < avances.length || avances.length >= MAX_ITINERAIRES_DE_SORTIE,
    zones: contours ? lieuxDeLaTrace(track.points, contours) : [],
  }
}
