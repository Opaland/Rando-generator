/**
 * Décider si une mesure réseau a eu lieu — la seule porte de sortie des
 * tests qui interrogent les vrais serveurs.
 *
 * Vit dans `tests/fixtures/` parce que deux projets TypeScript doivent la
 * voir : les tests e2e, qui s'en servent, et les tests unitaires, qui
 * l'éprouvent. `tests/e2e` et `tests/unit` appartiennent à deux projets
 * distincts et ne s'importent pas ; `tests/fixtures` est le terrain que les
 * deux ont déjà en commun.
 */

/** Une requête partie vers un tiers, et ce qu'elle est devenue. */
export interface TentativeReseau {
  hote: string
  /** Le code rendu, quand il y a eu une réponse. */
  statut?: number
  /** Ce qui a lâché, quand il n'y en a pas eu. */
  raison?: string
}

const estOverpass = (hote: string): boolean => hote.includes('overpass')

/**
 * Ce qu'il faut dire quand aucun miroir n'a **rendu de données**.
 *
 * Un test qui rougirait alors dirait « l'application est cassée » là où le
 * fait mesuré est « Overpass n'a rien donné ce soir ». C'est la distinction
 * de #346, et elle vaut ici aussi : on ne conclut pas d'une absence de
 * mesure.
 *
 * Deux garde-fous contre l'excuse trop commode, car une sortie muette est
 * exactement ce qu'on aimerait entendre quand le test dérange :
 *
 * - **rien de tenté, rien d'excusé.** Sans une seule tentative vers un
 *   miroir, la chaîne rendue est vide : le test rougit, et c'est ce qu'il
 *   doit faire, puisque l'application n'a alors même pas demandé ;
 * - **un seul 2xx suffit à rendre le test comptable.** Dès qu'un miroir a
 *   donné des données, ce que l'application en fait la regarde.
 */
export function raisonDeNePasConclure(
  tentatives: readonly TentativeReseau[],
): string {
  const versOverpass = tentatives.filter((t) => estOverpass(t.hote))
  if (versOverpass.length === 0) return ''
  if (
    versOverpass.some(
      (t) => t.statut !== undefined && t.statut >= 200 && t.statut < 300,
    )
  ) {
    return ''
  }
  const dits = versOverpass
    .map((t) =>
      t.statut === undefined
        ? `${t.hote} → ${t.raison ?? 'échec sans raison'}`
        : `${t.hote} → HTTP ${t.statut}`,
    )
    .join(', ')
  return `aucun miroir Overpass n'a rendu de données : ${dits}`
}
