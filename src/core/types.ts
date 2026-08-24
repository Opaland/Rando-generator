/** Coordonnée [longitude, latitude] — convention GeoJSON. */
export type LonLat = [number, number]

/**
 * GR/GRP/PR : réseaux OSM ; LOCAL : boucles balisées issues de l'open data
 * des collectivités (ex. Métropole de Lyon) — pas des PR® FFRandonnée ;
 * PERSO : itinéraires créés par l'utilisateur.
 */
/**
 * Le réseau de balisage d'un itinéraire.
 *
 * `INCONNU` n'est pas un sixième réseau : c'est l'aveu qu'OpenStreetMap ne
 * dit pas de quel réseau il s'agit. Il existe parce que `PR` servait de
 * corbeille et affirmait un balisage jamais constaté (issue #284).
 */
export type Network = 'GR' | 'GRP' | 'PR' | 'LOCAL' | 'PERSO' | 'INCONNU'

export interface TrailWay {
  osmWayId: number
  coords: LonLat[]
  /**
   * Tags OpenStreetMap du chemin, restreints à ce qu'on exploite
   * (issue #179).
   *
   * Optionnel, et il doit le rester : les zones déjà en cache n'en ont pas,
   * et elles doivent continuer à s'afficher sans qu'on demande à personne
   * de tout recharger.
   *
   * Restreints, parce que tout garder coûterait sans servir : mesuré sur la
   * donnée réelle, les tags complets de 3 489 chemins pèsent 450 ko, dont
   * l'essentiel en `maxspeed`, `lanes` ou `source` qui ne disent rien d'un
   * sentier. La revue du sprint 4 a montré ce que coûte un champ ajouté
   * sans mesure.
   */
  tags?: {
    surface?: string
    smoothness?: string
    tracktype?: string
    highway?: string
  }
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
  /**
   * Dernière modification de la relation dans OpenStreetMap, telle que
   * rapportée par Overpass. Dit l'âge de la donnée elle-même, là où
   * `fetchedAt` ne dit que celui de notre copie. Nul pour les itinéraires qui
   * ne viennent pas d'OSM, et pour les zones mises en cache avant que la
   * requête ne demande les métadonnées.
   */
  osmUpdatedAt?: string | null
  /** Présent uniquement pour les boucles locales open data (network LOCAL). */
  details?: LocalDetails
  /**
   * Provenance déclarée par le fichier d'origine, quand il en déclare une.
   * L'emporte sur ce que le réseau laisserait supposer (issue #87).
   */
  attribution?: SourceItineraire | null
  /**
   * Vrai pour un itinéraire venu d'un fichier déposé, par opposition à un
   * tracé dessiné dans l'application.
   *
   * La distinction n'existait pas : les deux étaient `PERSO`, et rien ne
   * permettait de dire « celui-ci vient de quelque part, et sa source
   * manque ». C'est elle qui permet de prévenir Léa sans rien inventer.
   */
  importe?: boolean
}

/** Échantillon de matching (un point tous les STEP mètres le long d'un way). */
export interface Sample {
  lon: number
  lat: number
  wayId: number
  /** Un way peut appartenir à plusieurs itinéraires. */
  itineraryIds: number[]
  done: boolean
  /** Distance à la trace GPS la plus proche, renseignée par le matching. */
  distanceMeters?: number
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
  /**
   * Horodatage de chaque point, en millisecondes depuis l'époque Unix,
   * aligné sur `points` (issue #149).
   *
   * Optionnel, et il doit le rester : les traces déjà en base n'en ont pas,
   * et elles doivent continuer à compter sans qu'on demande à personne de
   * tout réimporter. Un GPX exporté d'un logiciel de tracé n'en a pas non
   * plus, et reste un itinéraire cible parfaitement valide.
   */
  times?: (number | null)[]
  /**
   * HDOP par point, sans dimension. `null` quand le format ne porte pas du
   * tout cette mesure, ce qui n'est pas la même chose qu'un tableau de
   * `null` — celui-ci dit que le format la rapporte et que le fichier ne
   * l'a pas renseignée.
   */
  hdops?: (number | null)[] | null
  /** Précision GPS par point, en mètres. Même convention que `hdops`. */
  precisionsMetres?: (number | null)[] | null
}

export interface CompletionResult {
  itineraryId: number
  doneMeters: number
  totalMeters: number
  pct: number
  computedAt: string
}

/**
 * Catégories de points d'intérêt affichées dans la fiche détail.
 * La distinction entre `hut`, `bivouac` et `shelter` suit le wiki OSM :
 * un refuge gardé se réserve, un refuge non gardé (ou une cabane) permet
 * de dormir en autonomie, un abri météo n'est fait que pour une pause.
 */
export type PoiKind =
  | 'viewpoint'
  | 'peak'
  /** Col : le point où l'on bascule, et le repère d'un profil de montagne. */
  | 'pass'
  /** Refuge gardé (tourism=alpine_hut) : personnel, repas, réservation. */
  | 'hut'
  /** Refuge non gardé, cabane, abri où dormir (wilderness_hut, basic_hut…). */
  | 'bivouac'
  /**
   * Gîte d'étape : dortoirs et chambres partagées, sur réservation.
   *
   * `tourism=hostel`, ce que le wiki OpenStreetMap français recommande pour
   * un gîte d'étape — par opposition à `alpine_hut`, réservé au refuge de
   * montagne isolé et gardé. Sans cette catégorie, un chemin de plaine comme
   * celui de Saint-Jacques n'a aucun couchage connu, et son découpage en
   * étapes retombe au kilomètre.
   */
  | 'gite'
  /** Abri météo : pause ou urgence, pas prévu pour la nuit. */
  | 'shelter'
  | 'water'
  | 'picnic'
  /** Vestige qu'on va voir : ruine, château, site archéologique, moulin. */
  | 'ruins'
  /** Signalétique ancienne des chemins : croix, oratoire, borne. */
  | 'marker'
  | 'monument'

/** Informations pratiques d'un POI, telles que taguées dans OSM. */
/**
 * Provenance déclarée d'un itinéraire (issue #87, revue globale du 23/08).
 *
 * Portée par l'itinéraire lui-même et non déduite de son réseau : Léa importe
 * le PDIPR de son département, qui devient un tracé `PERSO` — et la Licence
 * Ouverte oblige pourtant à l'attribution. Le réseau dit le type de sentier,
 * pas d'où il vient.
 */
export interface SourceItineraire {
  author: string
  license: string
}

export interface PoiDetails {
  phone: string | null
  website: string | null
  /** Nombre de couchages annoncé (chaîne : OSM n'impose pas le format). */
  capacity: string | null
  openingHours: string | null
  operator: string | null
  /** Altitude en mètres, telle que taguée. */
  elevation: string | null
  /**
   * Potabilité déclarée dans OpenStreetMap, quand elle l'est. `null` signifie
   * « non renseigné », pas « non potable » — la nuance décide de ce qu'on
   * affiche, et de ce qu'on n'a pas le droit de laisser supposer.
   */
  drinkingWater: 'oui' | 'non' | 'traitee' | null
  /** Source saisonnière ou intermittente : tarie, elle ne rend pas service. */
  seasonal: boolean
  /** Source naturelle, par opposition à une fontaine aménagée. */
  spring: boolean
}

export interface PointOfInterest {
  /** « node/123 » : les ids OSM ne sont uniques qu'au sein d'un même type. */
  id: string
  lon: number
  lat: number
  kind: PoiKind
  name: string | null
  details: PoiDetails
}

/** Position de l'utilisateur, fournie par le navigateur — jamais transmise. */
export interface UserPosition {
  lon: number
  lat: number
  /** Rayon d'incertitude en mètres, tel que rapporté par l'appareil. */
  accuracy: number
}

/** Profil altimétrique d'un tracé : distances cumulées et altitudes alignées. */
export interface ElevationProfile {
  /** Distance cumulée depuis le départ, en mètres. */
  distances: number[]
  /** Altitude en mètres ; null si la donnée est indisponible à ce point. */
  elevations: (number | null)[]
  /**
   * Points du tracé, alignés sur `distances` : sans eux, un creux repéré sur
   * le graphique resterait introuvable sur la carte.
   */
  coords: LonLat[]
}

/** Pas d'échantillonnage le long des ways, en mètres. */
export const STEP_METERS = 100

/** Tolérance de matching par défaut, en mètres (réglable 25–100 dans l'UI). */
export const DEFAULT_TOLERANCE_METERS = 50

/** Taille des cellules du hachage spatial, en degrés (~160 m). */
export const CELL_SIZE_DEG = 0.0015
