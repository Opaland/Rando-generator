import { IGN_TILES } from '../components/map/style.ts'
import { tuileDe, urlDeTuile } from './corridor.ts'
import { ZOOMS_TERRAIN } from './telechargement.ts'
import type { LonLat } from './types.ts'

/**
 * Le plan IGN couvre-t-il l'endroit d'une randonnée ? Issue #593.
 *
 * Mesuré : en Nouvelle-Calédonie, `PLANIGNV2` rend 404 à partir du zoom 8
 * (22/10, revérifié le 27/10 — 200 à Lyon, 404 près de Nouméa au zoom 10).
 * La fiche montrait le sentier sur un aplat vide, et « Emporter » proposait
 * d'y télécharger des tuiles qui n'existent pas.
 *
 * La réponse se mesure sur une tuile témoin, au moment où l'on en a besoin,
 * plutôt que de s'écrire dans une liste de territoires couverts : la liste
 * serait inventée, et vieillirait en silence quand l'IGN étend son plan.
 *
 * Seul un 404 vaut « absent » — c'est ce qui a été mesuré. Tout le reste,
 * panne comprise, vaut « inconnu » : retirer « Emporter » sur une panne
 * priverait de la carte hors ligne justement quand on la prépare.
 */
export type Couverture = 'couvert' | 'absent' | 'inconnu'

export function couvertureDuStatut(statut: number | null): Couverture {
  if (statut === 404) return 'absent'
  if (statut !== null && statut >= 200 && statut < 300) return 'couvert'
  return 'inconnu'
}

/**
 * La tuile qui contient le départ, au zoom le plus bas qu'« Emporter »
 * télécharge — ou `null` sans trace.
 *
 * Pas la première tuile du corridor : c'était la voisine nord-ouest du
 * départ, la marge d'une tuile autour du point (relecture adverse du 27/10).
 * Le zoom le plus bas, parce qu'un 404 y veut dire « rien du tout ». Une
 * couverture qui s'arrête plus haut — mesuré à Hendaye : 200 à z12, 404 à
 * z16 — reste proposée, et ses tuiles manquantes se comptent en échecs,
 * comme avant. Un corridor à cheval sur deux territoires n'est jugé que sur
 * son départ : c'est une limite, pas une garantie.
 */
export function tuileTemoin(coords: readonly LonLat[]): string | null {
  const depart = coords[0]
  const zoom = ZOOMS_TERRAIN[0]
  if (depart === undefined || zoom === undefined) return null
  return urlDeTuile(tuileDe(depart[0], depart[1], zoom), IGN_TILES)
}

/**
 * Sonde la tuile témoin et rend son verdict. `recuperer` est `fetch` en
 * production, injecté pour être mesurable.
 */
export async function sonderLeFond(
  temoin: string | null,
  recuperer: (url: string) => Promise<{ status: number }>,
): Promise<Couverture> {
  if (temoin === null) return 'inconnu'
  try {
    const reponse = await recuperer(temoin)
    return couvertureDuStatut(reponse.status)
  } catch {
    return 'inconnu'
  }
}
