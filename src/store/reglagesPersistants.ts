import type { SettingKey } from '../db/database.ts'
import { ecrireReglage } from '../db/reglages.ts'

/**
 * La discipline des réglages qui survivent au rechargement (issues #203,
 * #155).
 *
 * Trois choses vivaient dispersées dans `appStore.ts` et n'ont de sens
 * qu'ensemble : le registre de ce que la personne a déjà touché, la règle de
 * reprise au démarrage, et l'écriture elle-même. Les séparer laissait à
 * chaque appelant le soin de les enchaîner dans le bon ordre — c'est-à-dire
 * de recopier une garde transverse, ce que le §4 proscrit.
 *
 * ## La course que ce module ferme
 *
 * `init` lit la base de façon asynchrone. Entre le premier rendu et la
 * réponse d'IndexedDB, la personne a le temps de cocher une case. Écraser
 * bêtement avec ce que la base contenait annulerait son geste sous ses yeux
 * — le défaut de #203.
 *
 * `repriseAuDemarrage` répond donc à une seule question : *cette clef a-t-elle
 * déjà été tranchée dans cette session ?* Si oui, la mémoire gagne ; sinon,
 * la base.
 *
 * Le même piège avait déjà été fermé pour les traces (« fusion, jamais
 * remplacement ») et il est resté ouvert pour les réglages assez longtemps
 * pour être rouvert d'un cran en ajoutant deux drapeaux sans relire le
 * commentaire (revue du sprint 6). D'où un module, plutôt qu'un commentaire.
 */

const reglagesTouches = new Set<SettingKey>()

/** À appeler dans chaque setter, avant d'écrire. */
export function marquerTouche(clef: SettingKey): void {
  reglagesTouches.add(clef)
}

/**
 * Ce qu'il faut retenir au démarrage : la base, sauf si la personne a déjà
 * tranché entre-temps.
 */
export function repriseAuDemarrage<T>(
  clef: SettingKey,
  deLaBase: T,
  enMemoire: T,
): T {
  return reglagesTouches.has(clef) ? enMemoire : deLaBase
}

/** Pour les tests : repartir d'une session vierge. */
export function oublierReglagesTouches(): void {
  reglagesTouches.clear()
}

/** Ce dont l'écriture a besoin du reste du store. */
export interface DependancesReglages {
  /** La base, ou `null` si elle n'a pas pu s'ouvrir. */
  baseOuverte: () => Promise<{
    setSetting: (clef: SettingKey, valeur: string | number) => Promise<unknown>
  } | null>
}

/**
 * Écrit un réglage, puis l'applique — **dans cet ordre**.
 *
 * `ecrireReglage` écrit dans `localStorage`, dont le contrat est synchrone :
 * quand il rend `true`, c'est écrit. On applique donc après, sachant que
 * c'est gardé.
 *
 * **Montrer après avoir écrit** a été essayé et abandonné : une case cochée
 * contrôlée par React revient visiblement à son ancien état le temps de
 * l'écriture. Vingt-trois tests de bout en bout l'ont dit d'une seule voix.
 * Échanger une perte rare contre un sursaut à chaque clic n'est pas un
 * progrès. Le détail est dans `db/reglages.ts`.
 *
 * Le repli sur IndexedDB n'est pas décoratif : certains navigateurs
 * verrouillent `localStorage` et pas l'autre. La fenêtre de #203 revient
 * alors, et c'est dit plutôt que masqué.
 *
 * Une fonction nommée plutôt que sept séquences recopiées (§4) — c'est
 * l'ancienne forme qui le montre le mieux : sept copies du même défaut.
 */
export function creerEnregistreurDeReglage(deps: DependancesReglages) {
  return async function enregistrerReglage(
    clef: SettingKey,
    valeur: string | number,
    appliquer: () => void,
  ): Promise<void> {
    marquerTouche(clef)
    const ecrit = ecrireReglage(clef, valeur)
    appliquer()
    if (ecrit) return
    const db = await deps.baseOuverte()
    if (db) await db.setSetting(clef, valeur)
  }
}
