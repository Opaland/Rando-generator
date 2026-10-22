import type { Feature, FeatureCollection, LineString } from 'geojson'
import { isWgs84Coordinate } from './geo.ts'
import type { LonLat } from './types.ts'

/**
 * Les PDIPR ouverts des départements, comme **réseau de fond** (issue #87).
 *
 * ## Pourquoi pas des itinéraires
 *
 * Le jeu de l'Isère (Licence Ouverte 2.0, © Département de l'Isère) compte
 * 16 862 tronçons « poteau à poteau », mesuré le 18/10 sur l'export réel :
 * chacun ne porte qu'une géométrie et le nom de sa collectivité
 * gestionnaire — ni nom de parcours, ni ref GR/PR, ni réseau. Les boucles de
 * la Métropole (`core/boucles.ts`) deviennent des itinéraires parce que
 * chaque objet y **est** une boucle nommée ; ici, en faire des itinéraires
 * supposerait d'inventer leurs limites et leurs noms. Cédric a tranché le
 * 18/10 : on les montre, on ne les compte pas — pas de pourcentage, pas
 * d'appariement GPS.
 *
 * Une source = une couche = son attribution : rien ici ne se mêle aux
 * données d'OpenStreetMap.
 */

/** Un rectangle en degrés WGS84. */
interface Emprise {
  readonly ouest: number
  readonly est: number
  readonly sud: number
  readonly nord: number
}

/**
 * L'emprise de l'Isère, à quelques kilomètres près.
 *
 * Elle n'est pas là pour découper au cordeau : elle écarte une géométrie
 * **reprojetée de travers**. Mesuré le 18/10 sur l'export réel : les 2 102
 * tronçons de Grenoble-Alpes Métropole — 12 % du jeu, et aucun de valide —
 * tombent tous en un amas de quelques mètres à 9,9° O, 8,3° N, au large de
 * l'Afrique de l'Ouest. Des coordonnées WGS84 parfaitement valides en
 * apparence, que `isWgs84Coordinate` laisse passer et que la carte aurait
 * peintes dans l'océan.
 *
 * Les tronçons valides s'étendent de 4,765 à 6,337° E et de 44,700 à
 * 45,878° N : la marge d'environ 5 km tout autour ne change rien à ce qui
 * est retenu aujourd'hui, et laisse passer un tronçon frontalier qu'une
 * prochaine extraction ajouterait.
 */
const EMPRISE_ISERE: Emprise = { ouest: 4.7, est: 6.4, sud: 44.65, nord: 45.93 }

/**
 * L'emprise de l'Ain, à environ 5 km près.
 *
 * Mesurée le 21/10 sur l'export réel (data.gouv.fr, jeu « PDIPR
 * itinéraire ») : les 483 boucles s'étendent de 4,729 à 6,163° E et de
 * 45,630 à 46,514° N, toutes valides — rien n'y est reprojeté de travers,
 * contrairement à l'Isère. L'emprise sert donc ici de garde, pas de filtre.
 */
const EMPRISE_AIN: Emprise = { ouest: 4.66, est: 6.23, sud: 45.58, nord: 46.56 }

/**
 * Ce que le producteur dit d'un objet, quand il le dit : les propriétés
 * brutes de l'export, que seul le script de préparation voit.
 */
type Proprietes = Readonly<Record<string, unknown>> | null | undefined

/** Un jeu PDIPR embarqué : son fichier, relatif à la base du site, et son emprise. */
interface JeuPdipr {
  readonly fichier: string
  readonly emprise: Emprise
  /**
   * Ce que le producteur demande d'écarter, lu sur les propriétés de
   * l'export. Appliqué **à la préparation seulement** : le fichier embarqué
   * ne porte plus que la géométrie (`scripts/preparer-pdipr.mjs`), il n'y a
   * plus rien à relire dans le navigateur.
   */
  readonly retenir?: (proprietes: Proprietes) => boolean
}

/**
 * L'Isère depuis le 18/10 ; l'Ain depuis le 21/10, quand data.gouv.fr a de
 * nouveau répondu (il coupait les connexions le 18 — on n'embarque pas un
 * jeu qu'on n'a pas lu).
 *
 * L'Ain publie des **boucles nommées**, pas des tronçons, et elles
 * pourraient devenir des itinéraires comme celles de la Métropole. Elles
 * restent pourtant en fond : 81 des 483 sont déjà dans OpenStreetMap
 * (couvertes à ≥ 80 % par des chemins PR, mesuré le 21/10, #574), et les
 * compter supposerait une règle de dédoublonnage dont le seuil change les
 * pourcentages — il est à Cédric (§2).
 *
 * Seules les boucles que le Département marque `g_diffusion = OUI` sont
 * reprises : 480 sur 483, les trois autres n'en disent rien.
 */
const JEUX_PAR_ZONE: Readonly<Record<string, JeuPdipr>> = {
  isere: { fichier: 'data/pdipr-isere.json', emprise: EMPRISE_ISERE },
  ain: {
    fichier: 'data/pdipr-ain.json',
    emprise: EMPRISE_AIN,
    retenir: (proprietes) => proprietes?.['g_diffusion'] === 'OUI',
  },
}

export function jeuPdiprPour(zoneKey: string | null): JeuPdipr | null {
  if (zoneKey === null || !Object.hasOwn(JEUX_PAR_ZONE, zoneKey)) return null
  return JEUX_PAR_ZONE[zoneKey] ?? null
}

export function reseauVide(): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: [] }
}

function dansEmprise([lon, lat]: LonLat, emprise: Emprise): boolean {
  return (
    lon >= emprise.ouest &&
    lon <= emprise.est &&
    lat >= emprise.sud &&
    lat <= emprise.nord
  )
}

function enLigne(coords: unknown, emprise: Emprise): Feature<LineString> | null {
  if (!Array.isArray(coords) || coords.length < 2) return null
  if (!coords.every(isWgs84Coordinate)) return null
  const points = coords.map((p): LonLat => [p[0], p[1]])
  if (!points.every((p) => dansEmprise(p, emprise))) return null
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points },
  }
}

/**
 * Lit un FeatureCollection de tronçons (LineString ou MultiLineString,
 * WGS84). Défensif de bout en bout, comme `parseBouclesGeoJSON` : un
 * tronçon malformé ou hors de son département est écarté, une donnée
 * illisible rend un réseau vide, rien ne lève.
 *
 * Appelée deux fois sur le même jeu : par `scripts/preparer-pdipr.mjs`, qui
 * n'embarque donc pas les octets d'un tronçon que la carte écarterait, et à
 * la lecture dans le navigateur. La règle est une seule fonction (§4).
 */
export function parseReseauPdipr(
  data: unknown,
  emprise: Emprise,
  retenir?: (proprietes: Proprietes) => boolean,
): FeatureCollection<LineString> {
  const reseau = reseauVide()
  const features = (data as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return reseau

  for (const brute of features as unknown[]) {
    if (retenir && !retenir((brute as { properties?: Proprietes } | null)?.properties)) {
      continue
    }
    const geometry = (brute as { geometry?: unknown } | null)?.geometry as
      | { type?: unknown; coordinates?: unknown }
      | null
      | undefined
    if (!geometry) continue
    const lignes =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString' &&
            Array.isArray(geometry.coordinates)
          ? (geometry.coordinates as unknown[])
          : []
    for (const coords of lignes) {
      const ligne = enLigne(coords, emprise)
      if (ligne) reseau.features.push(ligne)
    }
  }
  return reseau
}
