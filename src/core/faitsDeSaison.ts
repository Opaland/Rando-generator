import { trackDistanceMeters } from './history.ts'
import { lieuxDeLaTrace, type ContoursDeZone, type ZoneAContour } from './lieuxDeTrace.ts'
import { moisLocal } from './valeurLue.ts'
import type { Track } from './types.ts'

/**
 * Les faits d'un bilan de saison (issue #673).
 *
 * Claude écrit le texte d'un bilan ; **ce module calcule chaque nombre**, et
 * l'objet qu'il rend est exactement ce qui part chez Anthropic, montré à
 * l'utilisateur avant l'envoi. D'où ce qui n'y est jamais :
 *
 * - aucune coordonnée, aucune géométrie ;
 * - aucun nom de fichier ni nom de sortie : l'utilisateur les a choisis, et
 *   « Chez Mamie.gpx » dit où vit quelqu'un ;
 * - aucune date plus fine que le mois.
 *
 * Les seuls noms sont ceux des zones prédéfinies (`ZONES`), publics, retrouvés
 * par leurs contours embarqués (`lieuxDeTrace`, #296) — sans géocodage.
 *
 * Les arrondis — le dixième de kilomètre, le mètre de dénivelé — sont ceux de
 * l'affichage : un bilan qui dirait « 412,37 km » ne se lirait pas mieux, et
 * le texte vérifié (`nombresDuTexte`) accepte les arrondis de ces valeurs.
 */

interface MoisParcouru {
  /** Le mois en toutes lettres (« juin ») : l'année est celle du bilan. */
  mois: string
  sorties: number
  km: number
}

export interface FaitsDeSaison {
  annee: number
  sorties: number
  km: number
  /** `null` quand aucune sortie de l'année ne porte d'altitudes (§2). */
  deniveleM: number | null
  moisActifs: number
  moisLePlusParcouru: MoisParcouru | null
  plusLongueSortieKm: number | null
  plusGrosDeniveleM: number | null
  zones: { nom: string; sorties: number }[]
  anneePrecedente: { annee: number; sorties: number; km: number } | null
}

const NOM_DU_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })

const km = (metres: number): number => Math.round(metres / 100) / 10

function anneeDe(track: Track): number | null {
  const mois = moisLocal(track.date)
  return mois === null ? null : Number(mois.slice(0, 4))
}

/** Les années qui ont au moins une sortie datée, de la plus récente à la plus ancienne. */
export function anneesDeSorties(tracks: readonly Track[]): number[] {
  const annees = new Set<number>()
  for (const t of tracks) {
    const a = anneeDe(t)
    if (a !== null) annees.add(a)
  }
  return [...annees].sort((a, b) => b - a)
}

/**
 * Les faits de l'année `annee`, ou `null` si elle n'a aucune sortie datée.
 * `contours` absents (pas encore chargés) : aucune zone n'est nommée, rien
 * d'autre ne change.
 */
export function faitsDeSaison(
  tracks: readonly Track[],
  annee: number,
  contours?: ContoursDeZone | null,
  zones?: readonly ZoneAContour[],
): FaitsDeSaison | null {
  const deLAnnee = tracks.filter((t) => anneeDe(t) === annee)
  if (deLAnnee.length === 0) return null

  let metres = 0
  let denivele: number | null = null
  let plusLongue = 0
  let plusGros: number | null = null
  const parMois = new Map<string, { sorties: number; metres: number }>()
  const parZone = new Map<string, number>()

  for (const t of deLAnnee) {
    const longueur = trackDistanceMeters(t)
    metres += longueur
    plusLongue = Math.max(plusLongue, longueur)
    if (typeof t.elevationGain === 'number') {
      denivele = (denivele ?? 0) + t.elevationGain
      plusGros = Math.max(plusGros ?? 0, t.elevationGain)
    }
    const mois = moisLocal(t.date) as string
    const m = parMois.get(mois) ?? { sorties: 0, metres: 0 }
    m.sorties += 1
    m.metres += longueur
    parMois.set(mois, m)
    if (contours) {
      for (const nom of lieuxDeLaTrace(t.points, contours, zones)) {
        parZone.set(nom, (parZone.get(nom) ?? 0) + 1)
      }
    }
  }

  let meilleur: [string, { sorties: number; metres: number }] | null = null
  for (const entree of parMois) {
    if (!meilleur || entree[1].metres > meilleur[1].metres) meilleur = entree
  }

  const precedentes = tracks.filter((t) => anneeDe(t) === annee - 1)

  return {
    annee,
    sorties: deLAnnee.length,
    km: km(metres),
    deniveleM: denivele === null ? null : Math.round(denivele),
    moisActifs: parMois.size,
    moisLePlusParcouru: meilleur && {
      mois: NOM_DU_MOIS.format(new Date(`${meilleur[0]}-01T00:00:00Z`)),
      sorties: meilleur[1].sorties,
      km: km(meilleur[1].metres),
    },
    plusLongueSortieKm: km(plusLongue),
    plusGrosDeniveleM: plusGros === null ? null : Math.round(plusGros),
    zones: [...parZone]
      .map(([nom, sorties]) => ({ nom, sorties }))
      .sort((a, b) => b.sorties - a.sorties || a.nom.localeCompare(b.nom)),
    anneePrecedente:
      precedentes.length === 0
        ? null
        : {
            annee: annee - 1,
            sorties: precedentes.length,
            km: km(precedentes.reduce((s, t) => s + trackDistanceMeters(t), 0)),
          },
  }
}
