/** Coordonnée [longitude, latitude] — convention GeoJSON. */
export type LonLat = [number, number]

/**
 * GR/GRP/PR : réseaux OSM ; LOCAL : boucles balisées issues de l'open data
 * des collectivités (ex. Métropole de Lyon) — pas des PR® FFRandonnée ;
 * PERSO : itinéraires créés par l'utilisateur.
 */
export type Network = 'GR' | 'GRP' | 'PR' | 'LOCAL' | 'PERSO'

export interface TrailWay {
  osmWayId: number
  coords: LonLat[]
}

/** Métadonnées éditoriales d'une boucle locale (source open data). */
export interface LocalDetails {
  /** Producteur de la donnée, pour l'attribution (ex. « Métropole de Lyon »). */
  source: string
  commune: string | null
  /** ex. « facile », « moyen », « difficile » — vocabulaire du producteur. */
  difficulte: string | null
  /** Durée indicative telle que publiée (ex. « 2h40 »). */
  temps: string | null
  /** Dénivelé tel que publié (ex. « 140 m »). */
  denivele: string | null
  descriptif: string | null
  lienWeb: string | null
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
  /** Présent uniquement pour les boucles locales open data (network LOCAL). */
  details?: LocalDetails
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

/** Catégories de points d'intérêt affichées dans la fiche détail. */
export type PoiKind =
  | 'viewpoint'
  | 'peak'
  | 'hut'
  | 'water'
  | 'picnic'
  | 'monument'

export interface PointOfInterest {
  id: number
  lon: number
  lat: number
  kind: PoiKind
  name: string | null
}

/** Profil altimétrique d'un tracé : distances cumulées et altitudes alignées. */
export interface ElevationProfile {
  /** Distance cumulée depuis le départ, en mètres. */
  distances: number[]
  /** Altitude en mètres ; null si la donnée est indisponible à ce point. */
  elevations: (number | null)[]
}

/** Pas d'échantillonnage le long des ways, en mètres. */
export const STEP_METERS = 100

/** Tolérance de matching par défaut, en mètres (réglable 25–100 dans l'UI). */
export const DEFAULT_TOLERANCE_METERS = 50

/** Taille des cellules du hachage spatial, en degrés (~160 m). */
export const CELL_SIZE_DEG = 0.0015
