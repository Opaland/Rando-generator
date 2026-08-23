import { parseGpx, type ParsedGpx } from '../core/gpx.ts'
import { looksLikeFit, parseFit } from '../core/fit.ts'
import { looksLikeTcx, parseTcx } from '../core/tcx.ts'
import {
  GeoJsonError,
  looksLikeGeoJson,
  parseGeoJsonTrails,
  sourceDeclaree,
  type GeoJsonTrail,
} from '../core/geojson.ts'
import type { SourceItineraire } from '../core/types.ts'
import {
  ZipError,
  entreesDeTrace,
  listZipEntries,
  looksLikeZip,
  readZipEntry,
} from '../core/zip.ts'

/**
 * Lire ce qu'on dépose : archives, traces, couches d'itinéraires.
 *
 * Sorti d'`appStore.ts` à la revue globale du 23/08, où la dette de ce
 * fichier a été mesurée à **+48 %** depuis l'ouverture de #155 — 2 316 lignes
 * contre 1 566. Ces quatre fonctions n'y avaient rien à faire : aucune ne
 * touche à `set` ni à `get`, elles prennent des fichiers et rendent des
 * données. Ce sont les seules du magasin dont c'était vrai, et c'est
 * précisément pour cela qu'elles sortent en premier — l'extraction est
 * mécanique, donc sans risque de changer un comportement au passage.
 *
 * Ce qui reste dans le magasin est ce qui a besoin de l'état : les actions
 * d'import elles-mêmes, qui orchestrent ces lectures.
 */

/** Rend la main au navigateur le temps d'un rendu. */
async function pauseRendu(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Lit un fichier de trace, GPX ou FIT. Le format est reconnu à la signature
 * du contenu, pas à l'extension : une montre qui nomme mal son export reste
 * lisible, et un fichier renommé en .fit ne trompe personne.
 */
export async function parseTraceFile(file: File): Promise<ParsedGpx> {
  const buffer = await file.arrayBuffer()
  if (looksLikeFit(buffer)) {
    const fit = parseFit(buffer)
    return {
      points: fit.points,
      elevations: fit.elevations,
      date: fit.date,
      pointsHorsLimites: fit.pointsHorsLimites,
      times: fit.times,
      hdops: fit.hdops,
      precisionsMetres: fit.precisionsMetres,
    }
  }
  // Le format est reconnu au contenu, pas à l'extension : un fichier renommé
  // reste lisible, et un fichier mal nommé ne fait pas échouer l'import.
  const texte = new TextDecoder().decode(buffer)
  if (looksLikeTcx(texte)) return parseTcx(texte, new DOMParser())
  return parseGpx(texte, new DOMParser())
}

/**
 * Nom de fichier lisible pour une entrée d'archive : sans son dossier, et
 * sans le `.gz` d'un `.gpx.gz` puisque le contenu, lui, est décompressé.
 */
export function nomDEntree(chemin: string): string {
  const feuille = chemin.slice(chemin.lastIndexOf('/') + 1)
  return feuille.toLowerCase().endsWith('.gz') ? feuille.slice(0, -3) : feuille
}

/**
 * Remplace chaque archive déposée par les traces qu'elle contient.
 *
 * C'est ce qui tient lieu de connecteur Strava ou Garmin : l'utilisateur
 * exporte ses données chez eux et dépose l'archive ici (issue #89). Ce qui
 * n'est pas une trace — CSV de profil, photos, métadonnées macOS — est
 * ignoré sans être compté comme une erreur : ce sont des fichiers qui ne
 * nous concernent pas, pas des fichiers ratés.
 */
export async function developperArchives(
  fichiers: File[],
  avancement: (nom: string, faits: number, total: number) => void,
): Promise<{ fichiers: File[]; erreurs: string[] }> {
  const sortie: File[] = []
  const erreurs: string[] = []
  for (const fichier of fichiers) {
    let buffer: ArrayBuffer
    try {
      buffer = await fichier.arrayBuffer()
    } catch {
      erreurs.push(`${fichier.name} : lecture impossible.`)
      continue
    }
    if (!looksLikeZip(buffer)) {
      sortie.push(fichier)
      continue
    }
    try {
      const traces = entreesDeTrace(listZipEntries(buffer))
      if (traces.length === 0) {
        erreurs.push(
          `${fichier.name} : aucune trace GPX, FIT ou TCX dans cette archive.`,
        )
        continue
      }
      for (const [index, entree] of traces.entries()) {
        avancement(nomDEntree(entree.name), index, traces.length)
        await pauseRendu()
        try {
          const contenu = await readZipEntry(buffer, entree)
          sortie.push(
            new File([contenu as BlobPart], nomDEntree(entree.name)),
          )
        } catch (error) {
          erreurs.push(
            error instanceof ZipError
              ? `${nomDEntree(entree.name)} : ${error.message}`
              : `${nomDEntree(entree.name)} : extraction impossible.`,
          )
        }
      }
    } catch (error) {
      erreurs.push(
        error instanceof ZipError
          ? `${fichier.name} : ${error.message}`
          : `${fichier.name} : archive illisible.`,
      )
    }
  }
  return { fichiers: sortie, erreurs }
}

/**
 * Lit un fichier d'itinéraires déposé dans « Mes itinéraires ».
 *
 * Un GeoJSON de sentiers — un PDIPR départemental, par exemple — décrit
 * plusieurs itinéraires d'un coup, là où un GPX n'en porte qu'un. Le format
 * est reconnu au contenu, pas à l'extension.
 */
export async function lireItineraires(file: File): Promise<{
  trails: GeoJsonTrail[]
  pointsHorsLimites: number
  /**
   * Provenance déclarée par le fichier, quand il en déclare une (issue #87).
   * Portée jusqu'à l'export GPX : la Licence Ouverte l'exige, et le fichier
   * circulera hors d'ici.
   */
  source: SourceItineraire | null
}> {
  const buffer = await file.arrayBuffer()
  if (!looksLikeFit(buffer)) {
    const texte = new TextDecoder().decode(buffer)
    if (looksLikeGeoJson(texte)) {
      let donnees: unknown
      try {
        donnees = JSON.parse(texte)
      } catch {
        throw new GeoJsonError('Ce fichier n’est pas un JSON valide.')
      }
      return {
        trails: parseGeoJsonTrails(donnees),
        pointsHorsLimites: 0,
        source: sourceDeclaree(donnees),
      }
    }
  }
  const trace = await parseTraceFile(file)
  // Un GPX déposé dans « Mes itinéraires » est un tracé qu'on a dessiné ou
  // relevé soi-même : rien à attribuer, et rien à en dire.
  return {
    trails: [{ name: null, lines: [trace.points] }],
    pointsHorsLimites: trace.pointsHorsLimites,
    source: null,
  }
}