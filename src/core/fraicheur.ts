/**
 * La fraîcheur d'une copie de tracés : une règle, à un seul endroit (#571).
 *
 * Elle était écrite deux fois. `db/database.ts` jugeait une copie périmée à
 * 30 jours tout rond, en millisecondes, et la rechargeait ;
 * `core/dataQuality.ts` n'avertissait qu'au-delà de 30 jours **entiers**.
 * Entre les deux — une copie de 30,5 jours —, elle était rechargée sans
 * qu'aucun avertissement ne l'ait annoncée (§4ter).
 */

/** Durée de vie d'une copie de tracés : 30 jours. */
export const DUREE_DE_VIE_MS = 30 * 24 * 3600 * 1000

/** Vrai si un horodatage ISO a moins de `DUREE_DE_VIE_MS` d'ancienneté à `nowIso`. */
export function estFrais(fetchedAtIso: string, nowIso: string): boolean {
  const fetchedAt = Date.parse(fetchedAtIso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(fetchedAt) || Number.isNaN(now)) return false
  return now - fetchedAt < DUREE_DE_VIE_MS
}
