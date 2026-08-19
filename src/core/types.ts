/** Coordonnée [longitude, latitude] — convention GeoJSON. */
export type LonLat = [number, number]

/** GR/GRP/PR : réseaux OSM ; PERSO : itinéraires créés par l'utilisateur. */
export type Network = 'GR' | 'GRP' | 'PR' | 'PERSO'

export interface TrailWay {
  osmWayId: number
  coords: LonLat[]
}

export interface Itinerary {
  osmRelationId: number
  /** ex. « GR 7 » */
  ref: string | null
  /** ex. « Sentier des Crêtes du Pilat » */
  name: string | null
  network: Network
  /** Géométries dédupliquées par way id. */
  ways: TrailWay[]
  totalMeters: number
  /** ISO — pour l'invalidation du cache. */
  fetchedAt: string
}

/** Échantillon de matching (un point tous les STEP mètres le long d'un way). */
export interface Sample {
  lon: number
  lat: number
  wayId: number
  /** Un way peut appartenir à plusieurs itinéraires. */
  itineraryIds: number[]
  done: boolean
}

/** Trace GPX utilisateur. */
export interface Track {
  id: string
  filename: string
  points: LonLat[]
  /** Extrait du GPX si présent (ISO). */
  date: string | null
  importedAt: string
  /** Dénivelé positif cumulé en mètres (null si le GPX n'a pas d'altitudes). */
  elevationGain?: number | null
}

export interface CompletionResult {
  itineraryId: number
  doneMeters: number
  totalMeters: number
  pct: number
  computedAt: string
}

/** Pas d'échantillonnage le long des ways, en mètres. */
export const STEP_METERS = 100

/** Tolérance de matching par défaut, en mètres (réglable 25–100 dans l'UI). */
export const DEFAULT_TOLERANCE_METERS = 50

/** Taille des cellules du hachage spatial, en degrés (~160 m). */
export const CELL_SIZE_DEG = 0.0015
