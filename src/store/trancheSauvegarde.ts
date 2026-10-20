import {
  ajouterLesNeufs,
  backupFilename,
  buildBackup,
  compresserBackup,
  fusionnerItineraires,
  fusionnerTraces,
  lireArchiveBackup,
  serialiserBackup,
  BackupError,
} from '../core/backup.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import type { AllocateurPerso } from '../core/identifiantsPerso.ts'
import type { Itinerary, Track } from '../core/types.ts'
import type { SentiersDb } from '../db/database.ts'
import { ecrireLaRestauration, resumeDeRestauration } from './ecrireLaRestauration.ts'

/**
 * La sauvegarde, sortie du store (issue #155).
 *
 * Cinquième tranche. Elle porte les trois actions de « la seule copie qui
 * vous appartienne » : l'exporter, la relire, et effacer le message qui dit
 * ce qu'on vient de fusionner.
 *
 * ## Pourquoi ces trois-là ensemble
 *
 * Elles partagent un état — `backupMessage` — et surtout **une règle qui
 * n'appartient à personne d'autre** : ce qui est déjà là l'emporte, la
 * sauvegarde complète. Cette règle vaut pour les traces, pour les
 * itinéraires perso, pour les déclarations, et pour les réglages, chacun avec
 * sa raison. Éparpillée dans un fichier de mille quatre cents lignes, elle se
 * lisait quatre fois sans qu'on voie qu'elle n'en faisait qu'une.
 *
 * ## Deux gardes qui partent avec, et qu'il ne faut pas perdre
 *
 * Les deux appellent `quitterLaDemonstration` **avant** de toucher à quoi que
 * ce soit, et ce n'est pas de la précaution :
 *
 * - exporter en démonstration rapporterait des sorties fictives dans les
 *   vraies données au moment de relire la sauvegarde ;
 * - importer en démonstration laisserait ces sorties fictives en mémoire,
 *   comptées dans les statistiques, jusqu'au rechargement suivant. Trouvé à
 *   la revue du sprint 2, pas à la relecture.
 *
 * ## Ce que ce découpage n'est pas
 *
 * Une séparation d'état. La tranche lit les traces, les itinéraires perso,
 * les réglages et les déclarations du store, et les réécrit. Ses dépendances
 * sont listées une à une dans `DependancesSauvegarde` plutôt que masquées
 * derrière « le store » : le couplage devient visible quand il grandit, au
 * lieu de se cacher.
 */

/** Ce que la sauvegarde ajoute à l'état du store. */
interface EtatSauvegarde {
  /**
   * Ce que la dernière fusion a rapporté, ou `null`.
   *
   * Un import silencieux est un import dont on ne sait pas s'il a marché — et
   * la fusion, par construction, n'ajoute parfois rien du tout parce que tout
   * était déjà là. Le dire évite de croire que le fichier était vide.
   */
  backupMessage: string | null
}

/** Ce que la sauvegarde ajoute aux actions du store. */
interface ActionsSauvegarde {
  exporterSauvegarde: () => Promise<void>
  importerSauvegarde: (file: File) => Promise<void>
  clearBackupMessage: () => void
}

/** Ce que la tranche lit du reste du store, au moment où elle en a besoin. */
export interface LectureSauvegarde {
  tracks: Track[]
  customItineraries: Itinerary[]
  parcoursDeclares: ParcoursDeclare[]
  toleranceMeters: number
  completionPct: number
}

/** Ce que la tranche a besoin de savoir du reste du store. */
export interface DependancesSauvegarde {
  set: (
    partiel: Partial<
      EtatSauvegarde & {
        tracks: Track[]
        customItineraries: Itinerary[]
        parcoursDeclares: ParcoursDeclare[]
      }
    >,
  ) => void
  lire: () => LectureSauvegarde
  /**
   * Ajouter une erreur d'import à la liste affichée.
   *
   * Une action nommée plutôt qu'un `set` fonctionnel : deux fichiers déposés
   * coup sur coup écrivent dans la même liste, et remplacer un tableau lu
   * avant l'attente en perdrait un.
   */
  signalerErreurImport: (message: string) => void
  /** Sortir de la démonstration si l'on y est, sans rien faire sinon. */
  quitterLaDemonstration: () => Promise<void>
  baseOuverte: () => Promise<SentiersDb | null>
  /** Le distributeur de numéros perso du store, une fois la base lue (#543). */
  identifiantsPerso: () => Promise<AllocateurPerso>
  recalculer: () => Promise<void>
  setTolerance: (valeur: number) => Promise<void>
  setCompletionPct: (valeur: number) => Promise<void>
  /**
   * Remettre le fichier à l'utilisateur.
   *
   * Dépendance et non appel direct : `downloadBlob` fabrique un `<a>` et le
   * clique, donc la tranche entière exigeait un DOM pour être éprouvée. C'est
   * le test qui l'a montré — `ReferenceError: document is not defined` sur la
   * première assertion. Construire la sauvegarde et savoir comment un
   * navigateur enregistre un fichier sont deux métiers ; seul le premier est
   * ici.
   */
  telecharger: (nom: string, contenu: Blob) => void
  /**
   * L'instant de l'export.
   *
   * Injecté parce que le nom du fichier en dépend, et qu'un nom de fichier
   * qui change à chaque seconde ne s'asserte pas.
   */
  maintenant: () => string
}

export function trancheSauvegarde(
  deps: DependancesSauvegarde,
): ActionsSauvegarde {
  return {
    async exporterSauvegarde() {
      // Une sauvegarde de démonstration n'aurait aucun sens, et rapporterait
      // des sorties fictives dans les vraies données au moment de la relire.
      await deps.quitterLaDemonstration()
      const etat = deps.lire()
      const backup = buildBackup({
        tracks: etat.tracks,
        customItineraries: etat.customItineraries,
        settings: {
          toleranceMeters: etat.toleranceMeters,
          completionPct: etat.completionPct,
        },
        // Sans cela, quinze PR cochés à la main disparaîtraient au premier
        // changement de navigateur — et la sauvegarde, « la seule copie qui
        // vous appartienne », mentirait par omission (issue #158).
        parcoursDeclares: etat.parcoursDeclares,
        exportedAt: deps.maintenant(),
      })
      const octets = await compresserBackup(serialiserBackup(backup))
      deps.telecharger(
        backupFilename(backup.exportedAt),
        new Blob([octets as BlobPart], { type: 'application/gzip' }),
      )
    },

    async importerSauvegarde(file) {
      // Fusionner une sauvegarde avec des sorties fictives les laisserait en
      // mémoire, comptées dans les statistiques, jusqu'au rechargement
      // suivant (trouvé à la revue du sprint 2).
      await deps.quitterLaDemonstration()
      let backup
      try {
        backup = await lireArchiveBackup(await file.arrayBuffer())
      } catch (error) {
        deps.signalerErreurImport(
          `${file.name} : ${
            error instanceof BackupError ? error.message : 'lecture impossible.'
          }`,
        )
        return
      }

      // Le distributeur d'abord : il attend que la base soit lue, et `avant`
      // doit contenir ce qu'elle portait (#543).
      const identifiants = await deps.identifiantsPerso()
      const avant = deps.lire()
      const traces = fusionnerTraces(avant.tracks, backup.tracks)
      const persos = fusionnerItineraires(
        avant.customItineraries,
        backup.customItineraries,
        identifiants,
      )

      const db = await deps.baseOuverte()
      const neufsTraces = traces.tracks.slice(avant.tracks.length)
      const neufsPersos = persos.itineraries.slice(avant.customItineraries.length)

      /*
        Les déclarations se fusionnent comme le reste : ce qui est déjà là
        l'emporte, la sauvegarde complète. Écraser ferait disparaître une
        déclaration faite depuis l'export, exactement comme cela arrivait
        aux traces avant qu'on le corrige.
      */
      const neufsDeclares = backup.parcoursDeclares.filter(
        (d) =>
          !avant.parcoursDeclares.some((deja) => deja.itineraryId === d.itineraryId),
      )
      // Ce que la base a reçu, et seulement cela (#559, point 5).
      const ecrit = await ecrireLaRestauration(
        db,
        { traces: neufsTraces, persos: neufsPersos, declarations: neufsDeclares },
        avant.parcoursDeclares,
      )

      /*
        Ajouter à l'état d'**maintenant**, pas poser celui d'avant les
        écritures : entre les deux, plusieurs `await`, et un import déposé
        pendant ce temps disparaissait de la liste — en base, absent de
        l'écran jusqu'au rechargement. Relu sans `await` jusqu'au `set`.
        Les clefs sont celles sous lesquelles la base range chaque élément.
      */
      const apres = deps.lire()
      deps.set({
        tracks: ajouterLesNeufs(
          apres.tracks,
          [...avant.tracks, ...ecrit.traces],
          avant.tracks.length,
          (t) => t.id,
        ),
        customItineraries: ajouterLesNeufs(
          apres.customItineraries,
          [...avant.customItineraries, ...ecrit.persos],
          avant.customItineraries.length,
          (i) => i.osmRelationId,
        ),
        parcoursDeclares: ajouterLesNeufs(
          apres.parcoursDeclares,
          [...avant.parcoursDeclares, ...ecrit.declarations],
          avant.parcoursDeclares.length,
          (d) => d.itineraryId,
        ),
      })
      if (ecrit.traces.length > 0 || ecrit.persos.length > 0) {
        await deps.recalculer()
      }

      const resume = resumeDeRestauration(ecrit, traces, persos)
      // Interrompue : sans les réglages (voir `resumeDeRestauration`).
      if (ecrit.interrompue) {
        deps.set({ backupMessage: resume })
        return
      }

      // Les réglages ne sont repris que s'ils sont présents : une sauvegarde
      // ne doit pas remettre la tolérance à zéro parce qu'elle est ancienne.
      if (typeof backup.settings.toleranceMeters === 'number') {
        await deps.setTolerance(backup.settings.toleranceMeters)
      }
      if (typeof backup.settings.completionPct === 'number') {
        await deps.setCompletionPct(backup.settings.completionPct)
      }

      deps.set({ backupMessage: resume })
    },

    clearBackupMessage() {
      deps.set({ backupMessage: null })
    },
  }
}
