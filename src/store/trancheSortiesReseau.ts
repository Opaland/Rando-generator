/**
 * Le journal de ce qui sort de l'appareil, sorti du store (issue #445).
 *
 * `appStore.ts` a sept tranches déjà sorties, un plafond de 1 170 lignes et
 * une marge tombée à 13 : le prochain correctif réel l'aurait fait sauter
 * sous la pression, exactement comme #454 l'a fait sur `trancheZone.ts`.
 * `noterSortieReseau` était la seule action encore écrite en ligne plutôt
 * que déléguée — une trentaine de lignes, un module à elle, la première des
 * deux réponses honnêtes que `tests/unit/plafondDuStore.test.ts` nomme.
 *
 * ## Pourquoi une fabrique plutôt qu'une fonction sur `set`
 *
 * Même raison que `creerOubliDeZone` : pour que `appStore.ts` et les tests
 * appellent la **même** implémentation, et non deux copies qui divergent
 * sans que personne ne le remarque (§4bis).
 *
 * ## Ce que la tranche lit hors de son propre état
 *
 * `tracks` : l'échantillon surveillé se recalcule à chaque requête à partir
 * des traces importées, pour ne pas garder un champ de plus qu'il faudrait
 * tenir d'accord avec `tracks` à chaque import, suppression et restauration
 * (le §4 en germe, déjà écarté une fois dans ce même fichier).
 */

import { noterSortie, type EntreeJournal } from '../core/journalSortant.ts'
import {
  corpsContientUnPoint,
  echantillonDeTrace,
} from '../core/fuiteDeTrace.ts'
import type { Track } from '../core/types.ts'

/**
 * Points surveillés par trace (issue #178).
 *
 * Douze : assez pour couvrir un départ, une arrivée et dix points entre les
 * deux, ce qui suffit à reconnaître une trace partie en entier ou par
 * morceaux. Pas cent, parce que la recherche tourne à chaque requête, sur
 * le fil principal.
 *
 * C'est un seuil de **détection** : il ne change rien à ce qui est envoyé,
 * seulement ce qu'on est capable de voir partir. Il est donc tranché au
 * jugement, et écrit ici (§2).
 */
const POINTS_SURVEILLES_PAR_TRACE = 12

/** Ce que le journal des sorties réseau ajoute à l'état du store. */
export interface EtatSortiesReseau {
  /**
   * Ce qui est sorti de l'appareil depuis l'ouverture (issue #178).
   * En mémoire seulement : un compteur de vie privée qu'on persisterait
   * serait une ironie coûteuse.
   */
  sortiesReseau: EntreeJournal[]
  /**
   * Requêtes dont le corps portait un point de vos traces (issue #178).
   *
   * Il vaut zéro, et c'est le seul chiffre de l'application qu'on espère
   * voir rester à zéro. Il est **compté** et non écrit : jusqu'au 25/08,
   * l'interface affichait un `0` en dur, c'est-à-dire une promesse déguisée
   * en mesure.
   */
  requetesAvecTrace: number
}

/** Ce que le journal des sorties réseau ajoute aux actions du store. */
export interface ActionsSortiesReseau {
  noterSortieReseau: (url: string, corps?: string | null) => void
}

export const SORTIES_RESEAU_AU_REPOS: EtatSortiesReseau = {
  sortiesReseau: [],
  requetesAvecTrace: 0,
}

/** Ce que la tranche a besoin de savoir du reste du store. */
export interface DependancesSortiesReseau {
  set: (
    partiel:
      | Partial<EtatSortiesReseau>
      | ((
          etat: EtatSortiesReseau & { tracks: Track[] },
        ) => Partial<EtatSortiesReseau>),
  ) => void
}

export function trancheSortiesReseau(
  deps: DependancesSortiesReseau,
): ActionsSortiesReseau {
  return {
    // Enregistré sans passer par `set` immédiat sur chaque tuile : la
    // fusion par service borne le journal, et le rendu ne se déclenche que
    // lorsqu'un compteur change vraiment.
    noterSortieReseau(url, corps) {
      deps.set((etat) => {
        /*
          L'échantillon se refait à chaque requête plutôt que d'être gardé
          en mémoire. C'est un choix mesurable : douze points par trace,
          quatre écritures chacun, contre un champ de plus à tenir d'accord
          avec `tracks` à chaque import, suppression et restauration — le
          §4 en germe. Si le coût se voyait un jour, il se mémoïserait.
        */
        const echantillon = etat.tracks.flatMap((trace) =>
          echantillonDeTrace(trace.points, POINTS_SURVEILLES_PAR_TRACE),
        )
        const emporte = corpsContientUnPoint(corps, echantillon)
        return {
          sortiesReseau: noterSortie(etat.sortiesReseau, url),
          requetesAvecTrace: etat.requetesAvecTrace + (emporte ? 1 : 0),
        }
      })
    },
  }
}
