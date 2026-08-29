import type { AggregateStats } from './matching.ts'
import { DEFAULT_COMPLETION_PCT, isCompleted } from './milestones.ts'
import type { CompletionResult, Itinerary, Track } from './types.ts'
import { attributionDe, type GpxAttribution } from './gpxExport.ts'

/**
 * Bilan partageable : le chiffre qu'on a envie de montrer.
 *
 * « 61 % du tour du Pilat » se raconte ; « vous avez utilisé l'application »
 * non. Tout est calculé ici, en clair, pour que l'image produite plus tard
 * ne contienne rien d'autre que ce que l'utilisateur voit à l'écran — et
 * surtout : pas une seule coordonnée de ses traces.
 */

/** Au-delà, l'image devient un tableau qu'on ne lit plus. */
const TOP_MAX = 5

export interface SummaryLine {
  name: string
  pct: number
  completed: boolean
}

export interface Summary {
  pct: number
  doneMeters: number
  totalMeters: number
  /** Nombre de traces importées, datées ou non. */
  outings: number
  /** Première et dernière sortie datée (AAAA-MM-JJ), si elles existent. */
  period: { from: string; to: string } | null
  top: SummaryLine[]
  zoneLabel: string | null
  /**
   * Les provenances dont ces chiffres sont tirés, sans doublon (issue #388).
   *
   * L'image de partage doit créditer ses sources, et elle ne peut le faire
   * qu'en sachant lesquelles ont contribué. Sur **tous** les itinéraires
   * chargés et non sur les seuls du `top` : `totalMeters` les compte tous,
   * donc tous ont produit le chiffre affiché.
   *
   * Lues par `attributionDe`, la fonction nommée qui répond déjà à « à qui
   * doit-on quelque chose pour ce sentier » — plutôt que par une table des
   * réseaux, qui en aurait été une deuxième (§4) et qui aurait crédité le
   * PDIPR de Léa à OpenStreetMap (issue #87).
   *
   * Des provenances et non des phrases toutes faites : le cœur ne connaît
   * pas l'affichage. `src/lib/attribution.ts` les habille.
   */
  sources: GpxAttribution[]
}

export interface SummaryInput {
  global: AggregateStats
  results: CompletionResult[]
  itineraries: Itinerary[]
  tracks: Track[]
  zoneLabel?: string | null
  /** Seuil « bouclé » retenu par l'utilisateur (défaut : celui du module). */
  completionPct?: number
}

function isoDay(date: string | null): string | null {
  if (!date) return null
  const time = Date.parse(date)
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10)
}

/**
 * Les provenances distinctes d'un lot d'itinéraires, dans l'ordre où elles
 * apparaissent.
 *
 * Dédoublonnées sur l'auteur et non sur l'objet : `attributionDe` rend une
 * constante partagée pour les réseaux OSM, mais un **objet neuf** pour
 * chaque source déclarée. Comparer les références laisserait passer
 * « Département de l'Ain » autant de fois qu'il a d'itinéraires.
 */
function provenances(itineraries: Itinerary[]): GpxAttribution[] {
  const parAuteur = new Map<string, GpxAttribution>()
  for (const itineraire of itineraries) {
    const source = attributionDe(itineraire)
    if (source !== null && !parAuteur.has(source.author)) {
      parAuteur.set(source.author, source)
    }
  }
  return [...parAuteur.values()]
}

export function buildSummary(input: SummaryInput): Summary {
  const {
    global,
    results,
    itineraries,
    tracks,
    zoneLabel = null,
    completionPct = DEFAULT_COMPLETION_PCT,
  } = input
  const nameById = new Map(
    itineraries.map((i) => [
      i.osmRelationId,
      i.ref ?? i.name ?? `Itinéraire ${i.osmRelationId}`,
    ]),
  )

  const top = results
    // Un itinéraire jamais foulé n'a rien à faire dans un bilan de sortie.
    .filter((r) => r.pct > 0 && nameById.has(r.itineraryId))
    .sort((a, b) => b.pct - a.pct || b.doneMeters - a.doneMeters)
    .slice(0, TOP_MAX)
    .map((r) => ({
      name: nameById.get(r.itineraryId) ?? '',
      pct: r.pct,
      completed: isCompleted(r.pct, completionPct),
    }))

  const jours = tracks.map((t) => isoDay(t.date)).filter((j) => j !== null)
  jours.sort()
  const premier = jours[0]
  const dernier = jours[jours.length - 1]

  return {
    pct: global.pct,
    doneMeters: global.doneMeters,
    totalMeters: global.totalMeters,
    outings: tracks.length,
    period: premier && dernier ? { from: premier, to: dernier } : null,
    top,
    zoneLabel,
    sources: provenances(itineraries),
  }
}

/** Nom du fichier téléchargé, daté du jour de génération. */
export function summaryFilename(isoNow: string): string {
  const jour = isoDay(isoNow)
  return jour ? `bilan-sentiers-${jour}.png` : 'bilan-sentiers.png'
}
