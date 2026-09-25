import { polylineLengthMeters } from './sampling.ts'
import type { Itinerary } from './types.ts'

/**
 * Une ref dérivée : « GR 76A » se rattache à « GR 76 » — une lettre finale
 * collée à un numéro. Même regex que la mesure 6 de #333
 * (tests/unit/mesuresReseau.test.ts) : c'est une déduction sur du texte, pas
 * un lien de relation OSM — aucune superroute ne rattache la famille GR 76,
 * mesuré le 27/08 sur le Rhône — donc plus fragile qu'un identifiant, et
 * volontairement restreinte à ce seul motif.
 */
const REF_DERIVEE = /^(.*?\d+)\s?([A-Z])$/

export interface Recouvrement {
  tronc: Itinerary
  metresPartages: number
  pourcentageDeLaVariante: number
}

/**
 * Décision de Cédric (25/09, #333) : une variante et son tronc restent deux
 * itinéraires distincts, chacun avec son propre pourcentage de complétion —
 * jamais fusionnés. Mais le recouvrement se dit plutôt que se tait, comme
 * l'app le fait déjà pour les trous et l'âge des données : la mesure 14 a
 * trouvé de 0 % (GR 76A) à 39,3 % (GR 76D) selon la variante, et aucun des
 * deux chiffres n'est moins vrai que l'autre.
 *
 * Le recouvrement se lit au way OSM partagé, pas à une distance estimée —
 * même principe que la mesure 14 : deux relations qui suivent le même
 * tronçon de terrain se réfèrent au même `way`.
 */
export function recouvrementAvecTronc(
  itin: Itinerary,
  itineraires: Itinerary[],
): Recouvrement | null {
  const ref = itin.ref?.trim()
  if (!ref) return null
  const correspondance = REF_DERIVEE.exec(ref)
  const refTronc = correspondance?.[1]?.trim()
  if (!refTronc) return null

  const tronc = itineraires.find(
    (autre) =>
      autre.osmRelationId !== itin.osmRelationId &&
      autre.ref?.trim() === refTronc,
  )
  if (!tronc) return null

  const waysDuTronc = new Set(tronc.ways.map((w) => w.osmWayId))
  const metresPartages = itin.ways
    .filter((w) => waysDuTronc.has(w.osmWayId))
    .reduce((total, w) => total + polylineLengthMeters(w.coords), 0)

  return {
    tronc,
    metresPartages,
    pourcentageDeLaVariante:
      itin.totalMeters > 0 ? (metresPartages / itin.totalMeters) * 100 : 0,
  }
}
