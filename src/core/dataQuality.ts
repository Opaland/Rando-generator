import { distanceMeters } from './geo.ts'
import { chainWays } from './stages.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * Qualité de la donnée affichée.
 *
 * L'application montre des relations OpenStreetMap sans dire ce qu'elles
 * valent. Or une relation trouée produit un pourcentage parfaitement faux
 * — calculé sur ce qui est présent, sans mentionner ce qui manque — et
 * l'utilisateur n'a aucun moyen de s'en douter. Dire « il manque 12 km à
 * cette relation » ne répare rien, mais rend le chiffre lisible.
 *
 * Rien ici ne juge le terrain : on ne mesure que ce qu'on a téléchargé.
 */

/** Au-delà, la donnée mérite une actualisation (le cache dure 30 jours). */
export const STALE_DAYS = 30

/** En deçà, une interruption relève de l'imprécision de saisie, pas d'un trou. */
const MIN_GAP_METERS = 100

export interface GeometryGap {
  from: LonLat
  to: LonLat
  meters: number
}

export interface DataQuality {
  /** Morceaux distincts de la géométrie (1 = continue, 0 = rien d'exploitable). */
  pieces: number
  /** Interruptions entre morceaux, de la plus grande à la plus petite. */
  gaps: GeometryGap[]
  gapMeters: number
  /** Âge de la donnée en jours, si la date de téléchargement est lisible. */
  ageDays: number | null
  /** Messages prêts à afficher ; vide quand il n'y a rien à signaler. */
  warnings: string[]
}

function formatKm(meters: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
    meters / 1_000,
  )} km`
}

export function assessItinerary(
  itinerary: Itinerary,
  now: string,
): DataQuality {
  const chaine = chainWays(itinerary.ways)
  const gaps: GeometryGap[] = []
  let pieces = 0
  let precedent: LonLat | null = null

  for (const maillon of chaine) {
    if (maillon.newPiece) {
      pieces += 1
      if (precedent) {
        const meters = distanceMeters(precedent, maillon.start)
        // Sous le seuil, deux extrémités « séparées » sont en fait le même
        // point saisi deux fois : ce n'est pas un trou, c'est du bruit.
        if (meters >= MIN_GAP_METERS) {
          gaps.push({ from: precedent, to: maillon.start, meters })
        }
      }
    }
    precedent = maillon.end
  }

  gaps.sort((a, b) => b.meters - a.meters)
  const gapMeters = gaps.reduce((total, gap) => total + gap.meters, 0)

  const instant = Date.parse(itinerary.fetchedAt)
  const maintenant = Date.parse(now)
  const ageDays =
    Number.isNaN(instant) || Number.isNaN(maintenant)
      ? null
      : Math.floor((maintenant - instant) / 86_400_000)

  const warnings: string[] = []
  if (pieces === 0) {
    warnings.push(
      'Aucun tracé exploitable dans cette relation OpenStreetMap : le pourcentage ne veut rien dire ici.',
    )
  } else if (pieces > 1) {
    warnings.push(
      `Géométrie en ${pieces} morceaux dans OpenStreetMap` +
        (gapMeters > 0 ? `, ${formatKm(gapMeters)} d’interruptions` : '') +
        ' : la progression ne porte que sur les tronçons présents.',
    )
  }
  if (ageDays !== null && ageDays > STALE_DAYS) {
    warnings.push(
      `Tracés téléchargés il y a ${ageDays} jours — « Actualiser les tracés » ira rechercher les corrections apportées depuis.`,
    )
  }

  return { pieces, gaps, gapMeters, ageDays, warnings }
}
