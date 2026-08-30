/**
 * De quoi faire tourner la tranche d'import hors du store, et regarder ce
 * qu'elle appelle.
 *
 * Extrait de `importSansRien.test.ts` au moment où un second fichier en a eu
 * besoin — pas après. Le §4ter dit qu'on ne sait pas qu'on recopie au moment
 * où on le fait ; ici on le savait, donc il n'y avait pas de raison
 * d'attendre la troisième copie pour le nommer.
 *
 * Ce fichier n'est pas une suite : `vite.config.ts` ne collecte que
 * `tests/unit/` en `*.test.ts`.
 */
import {
  IMPORT_AU_REPOS,
  type DependancesImport,
  type EtatImport,
  type EtatPartage,
} from '../../src/store/trancheImport.ts'

/** Ce que la tranche a appelé, et combien de fois. */
export interface Appels {
  protegerLeStockage: number
  recompute: number
  sortirDeLaDemonstration: number
  /** Les identifiants passés à `fermerLaFicheSi`, dans l'ordre. */
  fermerLaFicheSi: number[]
  /** Les identifiants effacés de la base, dans l'ordre. */
  effaces: (string | number)[]
  /** Les identifiants enregistrés en base, dans l'ordre. */
  enregistres: (string | number)[]
}

export interface Espion {
  deps: DependancesImport
  appels: Appels
  etat: () => EtatImport & EtatPartage
}

/**
 * Une tranche d'import branchée sur des dépendances observables.
 *
 * `depart` sert aux actions qui suppriment : elles ont besoin de trouver
 * quelque chose à supprimer. `baseOuverte` rend une base factice qui note ce
 * qu'on lui demande d'effacer, plutôt que `null` — sans quoi la moitié de
 * `removeTrack` ne serait jamais atteinte.
 */
export function espionner(depart: Partial<EtatPartage> = {}): Espion {
  let etat: EtatImport & EtatPartage = {
    ...IMPORT_AU_REPOS,
    tracks: [],
    zoneLabel: null,
    customItineraries: [],
    selectedItineraryId: null,
    ...depart,
  }
  const appels: Appels = {
    protegerLeStockage: 0,
    recompute: 0,
    sortirDeLaDemonstration: 0,
    fermerLaFicheSi: [],
    effaces: [],
    enregistres: [],
  }
  /*
    Les quatre méthodes que la tranche appelle, relevées sur le fichier
    plutôt que devinées : `saveTrack`, `saveCustomItinerary`, `deleteTrack`,
    `deleteCustomItinerary`.

    En écrire moins ne rend pas le test plus petit, il le rend faux : une
    méthode absente lève, la tranche attrape, et le fichier ressort « lecture
    impossible » — un échec attribué au fichier pour un trou dans le harnais.
    C'est arrivé au premier essai, sur `saveTrack`, et c'est un test existant
    qui l'a dit.
  */
  const base = {
    saveTrack: (piste: { id: string }) => {
      appels.enregistres.push(piste.id)
      return Promise.resolve()
    },
    saveCustomItinerary: (itineraire: { osmRelationId: number }) => {
      appels.enregistres.push(itineraire.osmRelationId)
      return Promise.resolve()
    },
    deleteTrack: (id: string) => {
      appels.effaces.push(id)
      return Promise.resolve()
    },
    deleteCustomItinerary: (id: number) => {
      appels.effaces.push(id)
      return Promise.resolve()
    },
  }
  return {
    appels,
    etat: () => etat,
    deps: {
      set: (partiel) => {
        const suite = typeof partiel === 'function' ? partiel(etat) : partiel
        etat = { ...etat, ...suite }
      },
      etat: () => etat,
      /*
        Le transtypage est assumé : écrire un `SentiersDb` entier serait du
        décor. Le prix est que TypeScript ne dira rien le jour où la tranche
        appellera une cinquième méthode — elle ressortira en « lecture
        impossible », comme ci-dessus. Le relevé au-dessus est donc à refaire
        quand la tranche change.
      */
      baseOuverte: () =>
        Promise.resolve(base as unknown as Awaited<
          ReturnType<DependancesImport['baseOuverte']>
        >),
      recompute: () => {
        appels.recompute += 1
        return Promise.resolve()
      },
      protegerLeStockage: () => {
        appels.protegerLeStockage += 1
        return Promise.resolve()
      },
      sortirDeLaDemonstration: () => {
        appels.sortirDeLaDemonstration += 1
        return Promise.resolve()
      },
      fermerLaFicheSi: (id) => {
        appels.fermerLaFicheSi.push(id)
      },
    },
  }
}
