import type { LonLat } from './types.ts'

/**
 * Recherche par nom de lieu (issue #131).
 *
 * Le premier écran demandait une ref (« GR 20 ») ou un département : deux
 * choses qu'un débutant ne connaît pas. Il connaît sa ville.
 *
 * Le géocodeur est l'**API Adresse de la BAN** (data.gouv.fr, Licence
 * Ouverte), faite pour cet usage et couvrant la France entière. Nominatim
 * interdit le trafic automatisé sans contact déclaré : l'utiliser ici serait
 * emprunter un service à des conditions qu'on ne peut pas tenir.
 *
 * C'est une requête réseau de plus, traitée comme les autres : échec toléré,
 * message clair, et rien de mis en cache qui puisse périmer.
 */

/** Erreur de recherche de lieu, message affichable tel quel. */
export class GeocodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeocodeError'
  }
}

const GEOCODE_URL = 'https://api-adresse.data.gouv.fr/search/'

/** Nombre de propositions : assez pour lever une ambiguïté, pas une liste. */
const LIMITE = 5

export interface Lieu {
  label: string
  /** « 42, Loire, Auvergne-Rhône-Alpes » — deux Saint-Étienne se distinguent. */
  contexte: string | null
  center: LonLat
}

/**
 * URL de recherche.
 *
 * `type=municipality` : « des balades autour de Saint-Étienne » est une
 * question de commune. Sans ce filtre, la réponse est noyée sous les adresses
 * postales, qui ne disent rien de plus sur l'endroit où marcher.
 */
export function buildGeocodeUrl(query: string): string {
  const url = new URL(GEOCODE_URL)
  url.searchParams.set('q', query.trim())
  url.searchParams.set('type', 'municipality')
  url.searchParams.set('limit', String(LIMITE))
  return url.toString()
}

function champs(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === 'object' && valeur !== null
    ? (valeur as Record<string, unknown>)
    : null
}

/**
 * Relit une réponse GeoJSON.
 *
 * On s'appuie sur la *forme* GeoJSON — une garantie de format, pas une
 * promesse de ce service — et sur des noms de propriétés lus avec repli. Une
 * réponse qui n'a pas cette forme est refusée plutôt qu'interprétée : un
 * portail captif de wifi d'hôtel répond du HTML avec un code 200, et « aucun
 * lieu trouvé » serait alors un mensonge.
 */
export function parseGeocodeResponse(data: unknown): Lieu[] {
  const racine = champs(data)
  const features = racine?.['features']
  if (!Array.isArray(features)) {
    throw new GeocodeError(
      'La recherche de lieu a renvoyé une réponse inattendue. Réessayez dans un instant.',
    )
  }

  const lieux: Lieu[] = []
  for (const brut of features) {
    const feature = champs(brut)
    if (!feature) continue
    const geometry = champs(feature['geometry'])
    if (geometry?.['type'] !== 'Point') continue
    const coords = geometry['coordinates']
    if (
      !Array.isArray(coords) ||
      typeof coords[0] !== 'number' ||
      typeof coords[1] !== 'number'
    ) {
      continue
    }
    const props = champs(feature['properties']) ?? {}
    const label = props['label'] ?? props['name'] ?? props['city']
    if (typeof label !== 'string' || label.trim() === '') continue
    const contexte = props['context']
    lieux.push({
      label,
      contexte: typeof contexte === 'string' && contexte !== '' ? contexte : null,
      center: [coords[0], coords[1]],
    })
  }
  // L'ordre du service est un classement par pertinence : on ne re-trie pas
  // ce qu'on ne sait pas mieux classer que lui.
  return lieux
}

/** Interroge le service. `fetchImpl` est injecté pour les tests. */
export async function chercherLieux(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Lieu[]> {
  if (query.trim() === '') return []
  let reponse: Response
  try {
    reponse = await fetchImpl(buildGeocodeUrl(query))
  } catch {
    throw new GeocodeError(
      'La recherche de lieu n’a pas abouti : vérifiez votre connexion, ou ' +
        'choisissez une zone dans la liste.',
    )
  }
  if (!reponse.ok) {
    throw new GeocodeError(
      `La recherche de lieu est indisponible (erreur ${String(reponse.status)}). ` +
        'Réessayez dans un instant, ou choisissez une zone dans la liste.',
    )
  }
  let data: unknown
  try {
    data = await reponse.json()
  } catch {
    throw new GeocodeError(
      'La recherche de lieu a renvoyé une réponse illisible. Réessayez dans un instant.',
    )
  }
  return parseGeocodeResponse(data)
}
