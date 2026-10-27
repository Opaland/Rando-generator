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
 * Sonde la première tuile de la liste — celles d'un corridor partagent un
 * territoire — et rend son verdict. `recuperer` est `fetch` en production,
 * injecté pour être mesurable.
 */
export async function sonderLeFond(
  tuiles: readonly string[],
  recuperer: (url: string) => Promise<{ status: number }>,
): Promise<Couverture> {
  const temoin = tuiles[0]
  if (temoin === undefined) return 'inconnu'
  try {
    const reponse = await recuperer(temoin)
    return couvertureDuStatut(reponse.status)
  } catch {
    return 'inconnu'
  }
}
