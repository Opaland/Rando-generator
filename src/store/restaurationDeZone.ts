import { messageDeRestauration } from '../core/messageDeZone.ts'
import { libelleDeZone } from '../core/overpass.ts'
import type { Itinerary } from '../core/types.ts'
import { zoneUtilisable, type SentiersDb } from '../db/database.ts'

/**
 * Au démarrage, la dernière zone revient depuis le cache uniquement : jamais
 * d'appel réseau externe sans action de l'utilisateur.
 *
 * C'était le quatrième chemin d'une zone en cache, écrit à part dans
 * `appStore.ts`, et le seul qui sautait les gardes des trois autres : une
 * zone tronquée taisait « vos pourcentages sont surestimés », une copie de
 * schéma 1 ou de 90 jours passait pour fraîche (#550). Il en sort pour les
 * appliquer sans faire passer ce fichier au-dessus de son plafond.
 *
 * Rend vrai si une zone a été restaurée.
 */
export async function restaurerLaDerniereZone(
  db: SentiersDb,
  zoneKey: string,
  ports: {
    setItineraries: (
      zoneKey: string,
      zoneLabel: string,
      itineraries: Itinerary[],
      fetchedAt: string,
    ) => void
    poserMessage: (zoneError: string | null) => void
  },
): Promise<boolean> {
  const cached = await db.getZone(zoneKey)
  if (!cached) return false
  ports.setItineraries(
    zoneKey,
    libelleDeZone(zoneKey, cached.label),
    cached.itineraries,
    cached.fetchedAt,
  )
  ports.poserMessage(
    messageDeRestauration({
      itineraires: cached.itineraries.length,
      partielle: cached.partielle,
      perdues: cached.perdues,
      aJour: zoneUtilisable(cached, new Date().toISOString()),
    }),
  )
  return true
}
