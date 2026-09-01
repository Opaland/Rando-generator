/**
 * Ce qui entre par un fichier, sorti du store (issue #155).
 *
 * Troisième tranche, après le tracé d'itinéraire et la fiche détail. Elle
 * porte tout ce qui arrive du disque : les traces GPX, FIT, TCX et GeoJSON,
 * les itinéraires personnels lus dans les mêmes formats, les doublons mis
 * de côté, et les deux suppressions qui défont ces imports.
 *
 * ## Ce qu'elle corrige au passage
 *
 * **Quatre `instanceof` étaient recopiés dans les deux actions d'import.**
 * Le même bloc, mot pour mot, dans `importGpxFiles` et `importCustomGpx` :
 * quatre formats de fichier nommés deux fois, sans rien pour tenir les deux
 * listes d'accord.
 *
 * C'est le §4 dans sa forme exacte, et le dépôt en porte déjà la cicatrice :
 * « trois gardes de démonstration écrites à la main, une quatrième oubliée —
 * et la PR affirmait avoir couvert les trois chemins. Il y en avait
 * quatre. » Le jour où un cinquième format arrive, l'une des deux copies le
 * reçoit et l'autre non, et le fichier illisible devient « lecture
 * impossible » dans une moitié de l'application seulement.
 *
 * `messageDeLecture` remplace les deux copies par une liste consultée une
 * fois. L'oubli reste possible — aucun test ne voit un format qui n'existe
 * pas encore — mais il se répare à un seul endroit.
 *
 * ## Ce que ce découpage n'est pas
 *
 * Une séparation d'état. La tranche lit les traces et les itinéraires
 * personnels du store, écrit les deux, et déclenche le recalcul. Les
 * dépendances sont listées une à une plutôt que masquées derrière « le
 * store » : c'est ce qui rend le couplage visible quand il grandit, et ce
 * qui a permis de voir, en écrivant cette liste, que l'import touche à sept
 * choses distinctes.
 */

import { GpxError, elevationGainMeters, trackFingerprint } from '../core/gpx.ts'
import { FitError } from '../core/fit.ts'
import { TcxError } from '../core/tcx.ts'
import { GeoJsonError } from '../core/geojson.ts'
import { polylineLengthMeters } from '../core/sampling.ts'
import { espacementTropGrand } from '../core/matching.ts'
import type { Itinerary, Track } from '../core/types.ts'
import type { SentiersDb } from '../db/database.ts'
import { deposerLeResultatDeLImport } from './epilogueDImport.ts'
import {
  developperArchives,
  lireItineraires,
  parseTraceFile,
} from './lecture.ts'
import {
  messagePointsHorsLimites,
  messageTropEspacee,
} from '../core/coordonnees.ts'

/**
 * Rend la main au navigateur le temps d'un rendu.
 *
 * Sans elle, l'avancement d'un import est bien mis à jour dans l'état… et
 * jamais peint : le fil principal enchaîne directement sur le parsing
 * suivant, qui bloque (mesuré : ~320 ms pour un GPX de 9 Mo).
 *
 * Elle suit la tranche parce qu'elle n'a jamais servi qu'ici — elle vivait
 * dans `appStore.ts` par accident de naissance, pas par nécessité.
 */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Une trace écartée comme doublon, gardée le temps que la personne tranche.
 *
 * L'empreinte est une heuristique : elle n'a pas le droit de refuser sans
 * recours (issue #165).
 */
export interface DoublonEnAttente {
  id: string
  filename: string
  /** Nom du fichier dont l'empreinte coïncide. */
  ressembleA: string
  track: Track
}

/** Ce que l'import ajoute à l'état du store. */
export interface EtatImport {
  importErrors: string[]
  importDoublons: DoublonEnAttente[]
  /** Avancement d'un import en cours, `null` au repos. */
  importProgress: { done: number; total: number; filename: string } | null
}

/**
 * L'import au repos.
 *
 * Trois champs seulement, mais nommés ensemble pour la même raison que
 * `FICHE_FERMEE` : l'état initial du store et la fin de chaque import
 * doivent dire la même chose, et deux listes à garder d'accord finissent
 * toujours par diverger.
 */
export const IMPORT_AU_REPOS: EtatImport = {
  importErrors: [],
  importDoublons: [],
  importProgress: null,
}

/**
 * Les erreurs de lecture dont le message s'adresse à quelqu'un.
 *
 * Une `GpxError` dit « XML invalide à la ligne 12 » : c'est une phrase
 * écrite pour être lue. Une erreur quelconque dit « ENOSPC » ou une pile
 * d'appels — elle vient d'ailleurs et ne s'adresse à personne.
 *
 * La liste est consultée une fois, ici. Elle était écrite deux fois, en
 * conditions enchaînées, dans les deux actions d'import.
 */
const ERREURS_DE_LECTURE = [GpxError, FitError, TcxError, GeoJsonError] as const

/**
 * Le message à afficher pour un fichier qui n'a pas pu être lu.
 *
 * `lecture impossible.` reste volontairement vague sur ce qu'on ne comprend
 * pas : afficher le message d'une erreur inattendue reviendrait à montrer
 * une phrase écrite pour un développeur à quelqu'un qui voulait importer sa
 * sortie de dimanche.
 */
export function messageDeLecture(filename: string, erreur: unknown): string {
  const connue = ERREURS_DE_LECTURE.some((Type) => erreur instanceof Type)
  return connue
    ? `${filename} : ${(erreur as Error).message}`
    : `${filename} : lecture impossible.`
}

/** Ce que la tranche a besoin de savoir du reste du store. */
export interface DependancesImport {
  set: (
    partiel:
      | Partial<EtatImport & EtatPartage>
      | ((etat: EtatImport & EtatPartage) => Partial<EtatImport & EtatPartage>),
  ) => void
  etat: () => EtatImport & EtatPartage
  /** La base une fois ouverte, ou `null` si elle ne s'ouvrira pas. */
  baseOuverte: () => Promise<SentiersDb | null>
  /** Recalcule la complétion après une modification des traces. */
  recompute: () => Promise<void>
  /** Demande au navigateur de ne pas évincer le stockage (issue #159). */
  protegerLeStockage: () => Promise<void>
  /** « Maintenant, importez les vôtres » : la démonstration s'efface. */
  sortirDeLaDemonstration: () => Promise<void>
  /** Ferme la fiche détail si elle montre l'itinéraire supprimé. */
  fermerLaFicheSi: (id: number) => void
}

/** Les champs du store que la tranche lit et écrit sans les posséder. */
export interface EtatPartage {
  tracks: Track[]
  /**
   * La zone chargée, lue au moment de l'import (issue #206).
   *
   * En lecture seule pour cette tranche : elle appartient au chargement de
   * zone, qui est ailleurs. La lister ici plutôt que de la passer en
   * paramètre rend le couplage visible quand il grandit — c'est la règle du
   * découpage depuis la première tranche.
   */
  zoneLabel: string | null
  customItineraries: Itinerary[]
  selectedItineraryId: number | null
}

export interface ActionsImport {
  importGpxFiles: (files: Iterable<File>) => Promise<void>
  importCustomGpx: (files: Iterable<File>) => Promise<void>
  removeTrack: (id: string) => Promise<void>
  removeCustomItinerary: (id: number) => Promise<void>
  clearImportErrors: () => void
  importerDoublon: (id: string) => Promise<void>
  ignorerDoublon: (id: string) => void
  ignorerTousDoublons: () => void
}

export function trancheImport(deps: DependancesImport): ActionsImport {
  return {
    async importGpxFiles(files) {
      // « Maintenant, importez les vôtres » : la démonstration s'efface au
      // premier vrai fichier.
      await deps.sortirDeLaDemonstration()
      const errors: string[] = []
      const imported: Track[] = []
      const developpement = await developperArchives(
        [...files],
        (filename, done, total) => {
          deps.set({ importProgress: { done, total, filename } })
        },
      )
      errors.push(...developpement.erreurs)
      const liste = developpement.fichiers
      const knownFingerprints = new Map(
        deps.etat().tracks.map((t) => [trackFingerprint(t.points), t.filename]),
      )
      const doublons: DoublonEnAttente[] = []
      for (const [index, file] of liste.entries()) {
        try {
          deps.set({
            importProgress: {
              done: index,
              total: liste.length,
              filename: file.name,
            },
          })
          // Laisse le navigateur peindre l'avancement avant le parsing, qui
          // bloque le fil principal (mesuré : ~320 ms pour un GPX de 9 Mo).
          await pause()
          const parsed = await parseTraceFile(file)
          // Signalé avant tout le reste : même une trace importée avec succès
          // doit dire ce qu'elle a perdu en chemin (issue #167).
          const horsLimites = messagePointsHorsLimites(parsed.pointsHorsLimites)
          if (horsLimites) errors.push(`${file.name} : ${horsLimites}`)
          // Une trace trop espacée ne peut pas être située : le dire à
          // l'import vaut mieux qu'un chiffre muet que l'utilisateur ne peut
          // pas comprendre (issue #148).
          const espacement = espacementTropGrand(parsed.points)
          if (espacement !== null) {
            errors.push(`${file.name} : ${messageTropEspacee(espacement)}`)
          }
          if (parsed.points.length === 0) {
            errors.push(
              `${file.name} : aucun point de trace exploitable dans ce fichier.`,
            )
            continue
          }
          const track: Track = {
            id: crypto.randomUUID(),
            filename: file.name,
            points: parsed.points,
            date: parsed.date,
            importedAt: new Date().toISOString(),
            elevationGain: elevationGainMeters(parsed.elevations),
            times: parsed.times,
            hdops: parsed.hdops,
            precisionsMetres: parsed.precisionsMetres,
            // La zone du moment, si une zone est chargée (#206). Rien
            // d'inventé quand il n'y en a pas : le champ reste absent
            // plutôt que de porter « inconnue », qui se chercherait.
            ...(deps.etat().zoneLabel
              ? { zoneALImport: deps.etat().zoneLabel }
              : {}),
          }
          const fingerprint = trackFingerprint(parsed.points)
          const ressembleA = knownFingerprints.get(fingerprint)
          if (ressembleA) {
            // L'empreinte ne lit pas tous les points : elle ne peut pas
            // affirmer l'identité, seulement la ressemblance. La trace est
            // mise de côté, prête à être ajoutée si la personne le dit
            // (issue #165) — pas jetée.
            doublons.push({
              id: track.id,
              filename: file.name,
              ressembleA,
              track,
            })
            continue
          }
          knownFingerprints.set(fingerprint, file.name)
          // La base est attendue si elle s'ouvre encore : pendant le
          // démarrage, un `db` figé à null aurait laissé la trace en mémoire
          // seulement.
          const db = await deps.baseOuverte()
          if (db) {
            try {
              await db.saveTrack(track)
            } catch {
              // Quota de stockage dépassé. La lecture, elle, a parfaitement
              // réussi : la trace compte pour cette session, et seul le
              // rechargement suivant la perdra. Avant la revue du sprint 4,
              // cette erreur remontait dans le `catch` du fichier et
              // ressortait en « lecture impossible » — un reproche fait au
              // fichier pour une place qui manque. La trace était perdue
              // pour la session entière, sans que rien ne l'explique.
              errors.push(
                `${file.name} : plus de place pour enregistrer cette trace. Elle est comptée maintenant, mais elle aura disparu au prochain démarrage — exportez une sauvegarde ou supprimez des sorties.`,
              )
            }
          }
          imported.push(track)
        } catch (error) {
          errors.push(messageDeLecture(file.name, error))
        }
      }
      await deposerLeResultatDeLImport(deps, imported, errors, (a, etat) => ({
        tracks: [...etat.tracks, ...a],
      }))
      if (doublons.length > 0) {
        deps.set((state) => ({
          importDoublons: [...state.importDoublons, ...doublons],
        }))
      }
      if (imported.length > 0) await deps.protegerLeStockage()
    },

    async importCustomGpx(files) {
      // « Maintenant, importez les vôtres » : la démonstration s'efface au
      // premier vrai fichier.
      await deps.sortirDeLaDemonstration()
      const errors: string[] = []
      const imported: Itinerary[] = []
      let nextId = Math.min(
        0,
        ...deps.etat().customItineraries.map((i) => i.osmRelationId),
      )
      /*
        Un compteur unique pour les chemins, partagé par tous les tracés et
        tous les fichiers de l'import (issue #440).

        L'ancienne forme réservait mille identifiants par itinéraire —
        `nextId * 1_000 - index` — et se recouvrait au mille-et-unième
        tronçon : un tracé et le suivant partageaient alors un numéro, la
        carte dessinait l'un avec les coordonnées de l'autre, et la
        progression se créditait au mauvais itinéraire. Un compteur sans
        plafond n'a pas ce défaut, et n'oblige plus à choisir un nombre que
        rien ne justifie (§2).

        `reduce` plutôt qu'un `Math.min(...)` étalé : une bibliothèque déjà
        fournie peut porter des milliers de chemins, et l'étalement les passe
        tous en arguments d'un seul appel.
      */
      let nextWayId = deps
        .etat()
        .customItineraries.reduce(
          (plancher, itin) =>
            itin.ways.reduce((bas, way) => Math.min(bas, way.osmWayId), plancher),
          0,
        )
      const liste = [...files]
      for (const [index, file] of liste.entries()) {
        try {
          deps.set({
            importProgress: {
              done: index,
              total: liste.length,
              filename: file.name,
            },
          })
          await pause()
          const lecture = await lireItineraires(file)
          const horsLimites = messagePointsHorsLimites(
            lecture.pointsHorsLimites,
          )
          if (horsLimites) errors.push(`${file.name} : ${horsLimites}`)
          const exploitables = lecture.trails.filter((trail) =>
            trail.lines.some((ligne) => ligne.length >= 2),
          )
          if (exploitables.length === 0) {
            errors.push(
              `${file.name} : pas assez de points pour en faire un itinéraire.`,
            )
            continue
          }
          const nomDeBase = file.name.replace(
            /\.(gpx|fit|tcx|geojson|json)$/i,
            '',
          )
          const db = await deps.baseOuverte()
          for (const [rang, trail] of exploitables.entries()) {
            nextId -= 1
            const ways = trail.lines
              .filter((ligne) => ligne.length >= 2)
              .map((ligne) => {
                nextWayId -= 1
                return { osmWayId: nextWayId, coords: ligne }
              })
            const itinerary: Itinerary = {
              osmRelationId: nextId,
              ref: null,
              // Un GeoJSON peut décrire cent sentiers : chacun garde son nom,
              // et à défaut le fichier suivi de son rang — sans quoi la liste
              // afficherait cent fois la même ligne.
              name:
                trail.name ??
                (exploitables.length > 1
                  ? `${nomDeBase} (${rang + 1})`
                  : nomDeBase),
              network: 'PERSO',
              ways,
              totalMeters: ways.reduce(
                (somme, way) => somme + polylineLengthMeters(way.coords),
                0,
              ),
              fetchedAt: new Date().toISOString(),
              /*
                La provenance suit l'itinéraire (issue #87). Sans elle, le
                PDIPR que Léa importe s'exportait en GPX sans attribution —
                ce que la Licence Ouverte interdit.

                `importe` distingue un fichier déposé d'un tracé dessiné dans
                l'application : les deux sont `PERSO`, et rien ne permettait
                de dire « celui-ci vient de quelque part, et sa source
                manque ».
              */
              attribution: lecture.source,
              importe: true,
            }
            if (db) await db.saveCustomItinerary(itinerary)
            imported.push(itinerary)
          }
        } catch (error) {
          errors.push(messageDeLecture(file.name, error))
        }
      }
      await deposerLeResultatDeLImport(deps, imported, errors, (a, etat) => ({
        customItineraries: [...etat.customItineraries, ...a],
      }))
    },

    async removeTrack(id) {
      const db = await deps.baseOuverte()
      if (db) await db.deleteTrack(id)
      deps.set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }))
      await deps.recompute()
    },

    async removeCustomItinerary(id) {
      const db = await deps.baseOuverte()
      if (db) await db.deleteCustomItinerary(id)
      deps.fermerLaFicheSi(id)
      deps.set((state) => ({
        customItineraries: state.customItineraries.filter(
          (i) => i.osmRelationId !== id,
        ),
        selectedItineraryId:
          state.selectedItineraryId === id ? null : state.selectedItineraryId,
      }))
      await deps.recompute()
    },

    clearImportErrors() {
      deps.set({ importErrors: [] })
    },

    async importerDoublon(id) {
      const doublon = deps.etat().importDoublons.find((d) => d.id === id)
      if (!doublon) return
      deps.set((state) => ({
        importDoublons: state.importDoublons.filter((d) => d.id !== id),
      }))
      const db = await deps.baseOuverte()
      if (db) await db.saveTrack(doublon.track)
      deps.set((state) => ({ tracks: [...state.tracks, doublon.track] }))
      await deps.recompute()
    },

    ignorerDoublon(id) {
      deps.set((state) => ({
        importDoublons: state.importDoublons.filter((d) => d.id !== id),
      }))
    },

    ignorerTousDoublons() {
      // Redéposer une archive entière produit autant de propositions que de
      // sorties : sans ce geste, il faudrait les écarter une par une.
      deps.set({ importDoublons: [] })
    },
  }
}
