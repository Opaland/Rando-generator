/**
 * Jeter la ligne en cache d'une zone, pour qu'un rechargement forcé reparte
 * vraiment d'Overpass (issue #437).
 *
 * ## Pourquoi un module pour quatre lignes
 *
 * Parce que ces quatre lignes étaient écrites **trois fois** — dans
 * `loadZone`, `loadRef` et `loadAutour` de `trancheZone.ts` — et que deux des
 * trois copies étaient fausses. Elles lisaient `etat().db`, qui vaut encore
 * `null` pendant l'ouverture d'IndexedDB : une actualisation forcée lancée
 * dans cette fenêtre n'effaçait rien, et la ligne périmée survivait à la
 * demande de s'en défaire. C'est le §4 dans sa forme littérale.
 *
 * C'est `baseOuverte()` qu'il faut, comme pour l'écriture du cache et pour
 * `persistLastZone` : faire patienter l'opération plutôt que la perdre. Le
 * piège est exactement celui qui a fait naître `baseOuverte` — voir son
 * commentaire dans `appStore.ts`.
 *
 * ## Pourquoi une fabrique plutôt qu'une fonction sur `db`
 *
 * Pour que `appStore.ts` et les tests appellent **la même** implémentation.
 * Un harnais de test qui réécrit la règle qu'il éprouve est vert quoi qu'il
 * arrive — le §1bis, et je m'y suis fait prendre en écrivant ce lot : ma
 * première version du harnais recopiait ces quatre lignes, et aurait passé
 * même si `appStore.ts` avait gardé la mauvaise version.
 *
 * La forme est celle de `creerEnregistreurDeReglage`, pour la même raison.
 */
export interface DependancesOubli {
  /** La base, ou `null` si elle n'a pas pu s'ouvrir. */
  baseOuverte: () => Promise<{
    deleteZone: (zoneKey: string) => Promise<unknown>
  } | null>
}

export function creerOubliDeZone(deps: DependancesOubli) {
  return async function oublierLaZoneEnCache(zoneKey: string): Promise<void> {
    const db = await deps.baseOuverte()
    if (db) await db.deleteZone(zoneKey)
  }
}
