import type { Itinerary, LonLat } from './types.ts'

/**
 * Fabrique des sorties de démonstration à partir des itinéraires chargés.
 *
 * Le premier « aha » du produit — voir un pourcentage s'afficher — exigeait
 * deux actions non triviales et un fichier GPX que le débutant n'a pas
 * (issue #172). La démonstration montre le résultat d'abord, et demande
 * l'effort ensuite.
 *
 * Les sorties suivent la géométrie réelle des itinéraires, point pour point :
 * le pourcentage affiché est donc calculé par le même code que d'habitude,
 * avec les mêmes règles. Rien n'est simulé côté chiffres — c'est ce qui
 * distingue une démonstration d'une capture d'écran.
 */

/** Nombre de sorties fabriquées : assez pour un tableau de bord vivant. */
const SORTIES = 3

/** Part de l'itinéraire couverte par la dernière sortie, laissée en cours. */
const PART_PARTIELLE = 0.55

/** En deçà, un itinéraire est trop court pour qu'une sortie s'y lise. */
const POINTS_MINIMUM = 2

export interface SortieDeDemonstration {
  nom: string
  /** Identifiant de l'itinéraire suivi, pour expliquer ce que la démo montre. */
  itineraire: number
  points: LonLat[]
}

/**
 * Choisit des itinéraires et en tire des sorties, de façon déterministe.
 *
 * Le tri par identifiant n'a pas d'autre vertu que la stabilité : une
 * démonstration qui change de chiffres d'une fois sur l'autre donnerait
 * l'impression d'un calcul instable.
 */
export function construireDemonstration(
  itineraires: Itinerary[],
): SortieDeDemonstration[] {
  const utilisables = itineraires
    .filter((itineraire) => pointsDe(itineraire).length >= POINTS_MINIMUM)
    .sort((a, b) => a.osmRelationId - b.osmRelationId)

  // Il faut au moins un itinéraire de plus que de sorties : sans un
  // itinéraire intact, le tableau de bord afficherait 100 %, et « ce qu'il
  // reste à faire » — la raison d'être du produit — n'aurait rien à dire.
  if (utilisables.length <= SORTIES) return []

  const sorties: SortieDeDemonstration[] = []
  for (const [rang, itineraire] of utilisables.slice(0, SORTIES).entries()) {
    const points = pointsDe(itineraire)
    // La dernière sortie s'arrête en chemin : une progression en cours se
    // reconnaît mieux qu'une collection de cases cochées.
    const derniere = rang === SORTIES - 1
    const retenus = derniere
      ? points.slice(0, Math.max(POINTS_MINIMUM, Math.floor(points.length * PART_PARTIELLE)))
      : points
    sorties.push({
      nom: `Démonstration — ${itineraire.name ?? `itinéraire ${String(itineraire.osmRelationId)}`}`,
      itineraire: itineraire.osmRelationId,
      points: retenus,
    })
  }
  return sorties
}

/** Concatène les géométries d'un itinéraire en une seule suite de points. */
function pointsDe(itineraire: Itinerary): LonLat[] {
  return itineraire.ways.flatMap((way) => way.coords)
}
