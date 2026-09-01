/**
 * Ce que les deux imports font en dernier, écrit une fois (issue #442).
 *
 * ## Ce qui était en double
 *
 * `importGpxFiles` et `importCustomGpx` se terminaient par le même épilogue,
 * en clair dans chacune : l'avancement remis à zéro, l'arrivage rangé puis
 * la complétion recalculée, et les messages d'échec **cumulés** aux
 * précédents. Quatre fragments étaient identiques au caractère près.
 *
 * Les deux copies étaient d'accord — c'est une forme qui était en cause, pas
 * un défaut. Mais rien ne les tenait d'accord et ces deux fonctions ne
 * changent jamais ensemble : le §4 dit qu'une règle consultée par plusieurs
 * actions devient une fonction nommée, et le §4ter que deux listes disant la
 * même chose finissent par avoir le même trou.
 *
 * Ce n'est pas trouvé en relisant. Le script d'injection du §1 refuse un
 * motif qui n'apparaît pas exactement une fois, et il a refusé quatre motifs
 * sur sept en disant « trouvé 2 fois ». C'est l'outil qui a montré la
 * duplication.
 *
 * ## Pourquoi un fichier à part
 *
 * Parce que `trancheImport.ts` est à son plafond : 477 lignes pour 480. La
 * version posée dans le fichier a été écrite et **mesurée** — 500 lignes,
 * soit vingt de trop. L'issue prédisait que le fichier rétrécirait ; c'était
 * la même prédiction qu'en #437, fausse pour la même raison : une fonction
 * nommée coûte sa signature et son commentaire, et douze lignes retirées
 * n'en payent pas trente.
 *
 * Les types viennent de `trancheImport.ts` en import de type seul : ils sont
 * effacés à la compilation, il n'y a donc pas de cycle à l'exécution.
 */
import type {
  DependancesImport,
  EtatImport,
  EtatPartage,
} from './trancheImport.ts'

/** L'état complet que la tranche d'import lit et écrit. */
type EtatComplet = EtatImport & EtatPartage

/**
 * Range ce qu'un import a produit, quel que soit ce qu'il importait.
 *
 * `ranger` porte la seule chose qui distingue les deux appels : la
 * collection qui reçoit l'arrivage — `tracks` d'un côté,
 * `customItineraries` de l'autre.
 *
 * Le cumul des messages plutôt que leur remplacement n'est pas un détail :
 * un second import raté doit s'ajouter au premier, et `clearImportErrors`
 * est le seul moyen de vider la liste.
 */
export async function deposerLeResultatDeLImport<T>(
  deps: DependancesImport,
  imported: T[],
  errors: string[],
  ranger: (arrivants: T[], etat: EtatComplet) => Partial<EtatComplet>,
): Promise<void> {
  deps.set({ importProgress: null })
  if (imported.length > 0) {
    deps.set((etat) => ranger(imported, etat))
    await deps.recompute()
  }
  if (errors.length > 0) {
    deps.set((etat) => ({
      importErrors: [...etat.importErrors, ...errors],
    }))
  }
}
