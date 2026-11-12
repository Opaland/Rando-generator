import { trackDistanceMeters } from './history.ts'
import { lieuxDeLaTrace, type ContoursDeZone } from './lieuxDeTrace.ts'
import { moisLocal } from './valeurLue.ts'
import type { CompletionResult, Itinerary, Track } from './types.ts'

/**
 * Les questions sur ses sorties (issue #673, troisième usage).
 *
 * Claude ne reçoit **jamais** les sorties. Il reçoit la question, et peut
 * appeler ces fonctions, qui calculent ici, dans le navigateur, et ne
 * rendent que des totaux : sorties, kilomètres, dénivelé, par année, par
 * mois, par zone prédéfinie ; les plus longues sorties, sans nom ni jour ;
 * l'avancement des itinéraires publics. Jamais une coordonnée, un nom de
 * fichier, un jour, ni un itinéraire du réseau `PERSO`.
 *
 * Tout ce que ces fonctions rendent devient un « fait » : la réponse de
 * Claude n'est affichée que si chacun de ses nombres en vient
 * (`nombresInconnus`), comme pour le bilan et le récit.
 */

interface Schema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

/** Un outil tel que l'API Messages le déclare (`tools`). */
interface Outil {
  name: string
  description: string
  input_schema: Schema
  strict: true
}

const ANNEE = { type: 'integer', description: 'Année, par exemple 2026.' }

const schema = (properties: Record<string, unknown> = {}): Schema => ({
  type: 'object',
  properties,
  required: [],
  additionalProperties: false,
})

export const OUTILS_DE_QUESTIONS: readonly Outil[] = [
  {
    name: 'annees',
    description: 'Les années où la personne a randonné, avec pour chacune le nombre de sorties, les kilomètres et le dénivelé positif ; plus le nombre de sorties sans date.',
    input_schema: schema(),
    strict: true,
  },
  {
    name: 'totaux',
    description: 'Nombre de sorties, kilomètres et dénivelé positif, sur toutes les sorties datées, ou filtrés par année et mois.',
    input_schema: schema({
      annee: ANNEE,
      mois: { type: 'integer', description: 'Mois, de 1 (janvier) à 12 (décembre). Demande aussi une année.' },
    }),
    strict: true,
  },
  {
    name: 'par_mois',
    description: 'Pour une année, chaque mois du premier au dernier mois de sortie : sorties et kilomètres, mois vides compris.',
    input_schema: { ...schema({ annee: ANNEE }), required: ['annee'] },
    strict: true,
  },
  {
    name: 'par_zone',
    description: 'Sorties et kilomètres par zone prédéfinie approchée (département, parc), à une centaine de mètres près, sur toutes les années ou une seule.',
    input_schema: schema({ annee: ANNEE }),
    strict: true,
  },
  {
    name: 'plus_longues',
    description: 'Les plus longues sorties (cinq au plus), avec leur mois, leur longueur et leur dénivelé ; jamais leur nom ni leur jour.',
    input_schema: schema({
      annee: ANNEE,
      nombre: { type: 'integer', description: 'Combien, de 1 à 5.' },
    }),
    strict: true,
  },
  {
    name: 'itineraires',
    description: 'Les itinéraires balisés publics de la zone chargée, avec la part parcourue (%), les kilomètres faits et leur longueur totale.',
    input_schema: schema(),
    strict: true,
  },
]

interface Donnees {
  tracks: readonly Track[]
  /** `null` tant que l'avancement n'est pas calculé : une absence de mesure, pas « aucun ». */
  resultats: readonly CompletionResult[] | null
  itineraires: readonly Itinerary[]
  contours?: ContoursDeZone | null
}

const MOIS_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' })
const MOIS_ET_ANNEE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const unDecimal = (x: number): number => Math.round(x * 10) / 10
const nomDuMois = (aaaaMm: string, fmt = MOIS_LONG): string => fmt.format(new Date(`${aaaaMm}-01T00:00:00Z`))

class EntreeInvalide extends Error {}

/** Un entier facultatif de l'entrée, borné ; une valeur d'un autre type est refusée. */
function entier(entree: Record<string, unknown>, cle: string, min: number, max: number): number | null {
  if (!Object.hasOwn(entree, cle) || entree[cle] === null) return null
  const v = entree[cle]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    // Aucun chiffre dans une erreur : ses nombres entreraient dans les faits
    // de la vérification, et « 1900 sorties » passerait (relecture du 12/11).
    throw new EntreeInvalide(`${cle} hors des valeurs permises`)
  }
  return v
}

function totauxDe(tracks: readonly Track[]) {
  let metres = 0
  let denivele: number | null = null
  for (const t of tracks) {
    metres += trackDistanceMeters(t)
    if (typeof t.elevationGain === 'number') denivele = (denivele ?? 0) + t.elevationGain
  }
  return {
    sorties: tracks.length,
    km: unDecimal(metres / 1000),
    deniveleM: denivele === null ? null : Math.round(denivele),
  }
}

function dateesDe(tracks: readonly Track[], annee: number | null, mois: number | null) {
  return tracks.filter((t) => {
    const m = moisLocal(t.date)
    if (m === null) return false
    if (annee !== null && Number(m.slice(0, 4)) !== annee) return false
    return mois === null || Number(m.slice(5, 7)) === mois
  })
}

/**
 * Exécute un outil et rend son résultat — ou `{ erreur }`, jamais une
 * exception : la réponse part telle quelle chez Claude, qui peut corriger
 * son appel.
 */
export function executerOutil(nom: string, entreeBrute: unknown, donnees: Donnees): unknown {
  const entree =
    entreeBrute !== null && typeof entreeBrute === 'object' ? (entreeBrute as Record<string, unknown>) : {}
  try {
    switch (nom) {
      case 'annees': {
        const annees = [...new Set(dateesDe(donnees.tracks, null, null).map((t) => Number(moisLocal(t.date)?.slice(0, 4))))]
          .sort((a, b) => b - a)
          .map((annee) => ({ annee, ...totauxDe(dateesDe(donnees.tracks, annee, null)) }))
        return { annees, sortiesSansDate: donnees.tracks.filter((t) => moisLocal(t.date) === null).length }
      }
      case 'totaux': {
        const annee = entier(entree, 'annee', 1900, 2100)
        const mois = entier(entree, 'mois', 1, 12)
        // Sans année, un mois additionnerait tous les mars de toutes les années.
        if (mois !== null && annee === null) throw new EntreeInvalide('un mois demande une année')
        return totauxDe(dateesDe(donnees.tracks, annee, mois))
      }
      case 'par_mois': {
        const annee = entier(entree, 'annee', 1900, 2100)
        if (annee === null) throw new EntreeInvalide('l’année est requise')
        const parMois = new Map<string, Track[]>()
        for (const t of dateesDe(donnees.tracks, annee, null)) {
          const m = moisLocal(t.date) as string
          parMois.set(m, [...(parMois.get(m) ?? []), t])
        }
        const cles = [...parMois.keys()].sort()
        if (cles.length === 0) return []
        const premier = Number((cles[0] as string).slice(5, 7))
        const dernier = Number((cles[cles.length - 1] as string).slice(5, 7))
        return Array.from({ length: dernier - premier + 1 }, (_, i) => {
          const m = `${String(annee)}-${String(premier + i).padStart(2, '0')}`
          const { sorties, km } = totauxDe(parMois.get(m) ?? [])
          return { mois: nomDuMois(m), sorties, km }
        })
      }
      case 'par_zone': {
        const annee = entier(entree, 'annee', 1900, 2100)
        if (!donnees.contours) throw new EntreeInvalide('zones pas encore chargées, mesure indisponible')
        const parZone = new Map<string, Track[]>()
        for (const t of annee === null ? donnees.tracks : dateesDe(donnees.tracks, annee, null)) {
          for (const zone of lieuxDeLaTrace(t.points, donnees.contours)) {
            parZone.set(zone, [...(parZone.get(zone) ?? []), t])
          }
        }
        return [...parZone]
          .map(([zone, ts]) => ({ zone, sorties: ts.length, km: totauxDe(ts).km }))
          .sort((a, b) => b.sorties - a.sorties || a.zone.localeCompare(b.zone))
      }
      case 'plus_longues': {
        const annee = entier(entree, 'annee', 1900, 2100)
        const nombre = Math.min(entier(entree, 'nombre', 1, 1000) ?? 5, 5)
        return dateesDe(donnees.tracks, annee, null)
          .map((t) => ({ t, metres: trackDistanceMeters(t) }))
          .sort((a, b) => b.metres - a.metres)
          .slice(0, nombre)
          .map(({ t, metres }) => ({
            mois: nomDuMois(moisLocal(t.date) as string, MOIS_ET_ANNEE),
            km: unDecimal(metres / 1000),
            deniveleM: typeof t.elevationGain === 'number' ? Math.round(t.elevationGain) : null,
          }))
      }
      case 'itineraires': {
        if (donnees.resultats === null) {
          throw new EntreeInvalide('avancement pas encore calculé, mesure indisponible')
        }
        const resultats = donnees.resultats
        const publics = new Map(
          donnees.itineraires
            .filter((i) => i.network !== 'PERSO')
            .map((i) => [i.osmRelationId, i.name ?? i.ref ?? `Itinéraire ${String(i.osmRelationId)}`]),
        )
        return resultats
          .filter((r) => publics.has(r.itineraryId))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 20)
          .map((r) => ({
            nom: publics.get(r.itineraryId) as string,
            pct: unDecimal(r.pct),
            kmFaits: unDecimal(r.doneMeters / 1000),
            kmTotal: unDecimal(r.totalMeters / 1000),
          }))
      }
      default:
        return { erreur: 'outil inconnu' }
    }
  } catch (e) {
    if (e instanceof EntreeInvalide) return { erreur: e.message }
    throw e
  }
}
