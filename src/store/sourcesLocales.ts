import { parseBouclesGeoJSON } from '../core/boucles.ts'
import { parseGrNordGeoJSON } from '../core/grNord.ts'
import type { Itinerary } from '../core/types.ts'

/**
 * Les jeux d'itinéraires open data embarqués avec le site, et les zones
 * qu'ils couvrent (issue #87 : « une source = une couche = son attribution »
 * — aujourd'hui les boucles de la Métropole de Lyon et le GR Nord de la
 * Province Nord, demain les PDIPR de l'Ain ou de l'Isère).
 *
 * Sorti de `trancheZone.ts` en écrivant le second : le fichier tenait sous
 * son plafond de 530 lignes avec la seule Métropole, plus avec les deux
 * (issue #487, #504 : c'est ce plafond, pas la logique de zone elle-même,
 * qui trace la limite de ce module). Ce que `trancheZone.ts` garde, c'est la
 * fusion dans l'état affiché ; ce que ce fichier porte, c'est d'où vient
 * chaque source et à qui elle s'adresse.
 */

/** Zones dont le périmètre couvre la Métropole de Lyon (boucles locales). */
const ZONES_WITH_LOCAL_BOUCLES = new Set(['rhone', 'trois'])

/** Zones que le GR Nord (Province Nord, Nouvelle-Calédonie) traverse. */
const ZONES_WITH_GR_NORD = new Set(['nouvelle-caledonie'])

/**
 * Fabrique un accès paresseux, mémorisé une fois, à un jeu d'itinéraires
 * embarqué avec le site (`public/data/*.json`) — le même besoin pour les
 * boucles de Lyon et pour le GR Nord : télécharger une fois, ne jamais
 * relever un échec pour la session entière.
 *
 * Nommée plutôt que recopiée (CLAUDE.md §4) : la première version portait ce
 * mécanisme deux fois, une par source, avant même que la seconde existe —
 * c'est en écrivant le GR Nord que la règle recopiée s'est vue.
 */
function fetchJsonItineraries(
  url: string,
  parse: (data: unknown, fetchedAt: string) => Itinerary[],
): () => Promise<Itinerary[]> {
  let cached: Promise<Itinerary[]> | null = null
  return function fetchCached(): Promise<Itinerary[]> {
    cached ??= fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => parse(data, new Date().toISOString()))
      .catch(() => [])
      .then((itineraries) => {
        // Un échec ne se mémorise pas. Hors ligne au premier chargement, la
        // source serait sinon absente pour toute la session, alors qu'un
        // simple changement de zone suffirait à la retrouver.
        if (itineraries.length === 0) cached = null
        return itineraries
      })
    return cached
  }
}

const chargerBoucles = fetchJsonItineraries(
  `${import.meta.env.BASE_URL}data/boucles-metropole-lyon.json`,
  parseBouclesGeoJSON,
)

/**
 * Boucles locales open data (© Métropole de Lyon, Licence Ouverte 2.0).
 *
 * Exportée parce que la démonstration s'en sert : elle rejoue des sorties
 * fictives sur les boucles locales, qui sont embarquées avec le site et donc
 * disponibles hors ligne dès le premier écran.
 *
 * Fonction nommée plutôt que la constante directement issue de la fabrique :
 * `npm run ports` relie un port à une fonction par son **nom** dans la carte
 * de couverture, et une constante liée à la clôture générique que rend
 * `fetchJsonItineraries` n'en porte aucun qui corresponde — le port
 * `bouclesLocales: fetchLocalBoucles` devenait irrésolu.
 */
export function fetchLocalBoucles(): Promise<Itinerary[]> {
  return chargerBoucles()
}

/** Le GR Nord (© Province Nord, Licence Ouverte 2.0) — voir `core/grNord.ts`. */
const chargerGrNord = fetchJsonItineraries(
  `${import.meta.env.BASE_URL}data/gr-nord-province-nord.json`,
  parseGrNordGeoJSON,
)

function fetchGrNord(): Promise<Itinerary[]> {
  return chargerGrNord()
}

/**
 * Les accès aux sources embarquées qui couvrent cette zone, prêts à être
 * fusionnés — jamais interrogés pour une zone qu'ils ne concernent pas.
 */
export function sourcesLocalesPour(
  zoneKey: string,
): (() => Promise<Itinerary[]>)[] {
  const sources: (() => Promise<Itinerary[]>)[] = []
  if (ZONES_WITH_LOCAL_BOUCLES.has(zoneKey)) sources.push(fetchLocalBoucles)
  if (ZONES_WITH_GR_NORD.has(zoneKey)) sources.push(fetchGrNord)
  return sources
}
