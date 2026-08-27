import {
  backupFilename,
  buildBackup,
  compresserBackup,
  resumeFusion,
  fusionnerItineraires,
  fusionnerTraces,
  lireArchiveBackup,
  serialiserBackup,
  BackupError,
} from '../core/backup.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import type { Itinerary, Track } from '../core/types.ts'
import type { SentiersDb } from '../db/database.ts'

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
export interface EtatSauvegarde {
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
export interface ActionsSauvegarde {
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

      const avant = deps.lire()
      const traces = fusionnerTraces(avant.tracks, backup.tracks)
      const persos = fusionnerItineraires(
        avant.customItineraries,
        backup.customItineraries,
      )

      const db = await deps.baseOuverte()
      if (db) {
        for (const track of traces.tracks.slice(avant.tracks.length)) {
          await db.saveTrack(track)
        }
        for (const itin of persos.itineraries.slice(
          avant.customItineraries.length,
        )) {
          await db.saveCustomItinerary(itin)
        }
      }

      /*
        Les déclarations se fusionnent comme le reste : ce qui est déjà là
        l'emporte, la sauvegarde complète. Écraser ferait disparaître une
        déclaration faite depuis l'export, exactement comme cela arrivait
        aux traces avant qu'on le corrige.
      */
      const declaresFusionnes = [
        ...avant.parcoursDeclares,
        ...backup.parcoursDeclares.filter(
          (d) =>
            !avant.parcoursDeclares.some(
              (deja) => deja.itineraryId === d.itineraryId,
            ),
        ),
      ]
      if (db) {
        for (const declaration of declaresFusionnes) {
          await db.declarerParcours(declaration)
        }
      }

      deps.set({
        tracks: traces.tracks,
        customItineraries: persos.itineraries,
        parcoursDeclares: declaresFusionnes,
      })
      if (traces.ajoutees > 0 || persos.ajoutes > 0) await deps.recalculer()

      // Les réglages ne sont repris que s'ils sont présents : une sauvegarde
      // ne doit pas remettre la tolérance à zéro parce qu'elle est ancienne.
      if (typeof backup.settings.toleranceMeters === 'number') {
        await deps.setTolerance(backup.settings.toleranceMeters)
      }
      if (typeof backup.settings.completionPct === 'number') {
        await deps.setCompletionPct(backup.settings.completionPct)
      }

      deps.set({ backupMessage: resumeFusion(traces, persos) })
    },

    clearBackupMessage() {
      deps.set({ backupMessage: null })
    },
  }
}
