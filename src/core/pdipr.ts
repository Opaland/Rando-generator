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

/** Un jeu PDIPR embarqué : son fichier, relatif à la base du site, et son emprise. */
interface JeuPdipr {
  readonly fichier: string
  readonly emprise: Emprise
}

/**
 * Seule l'Isère pour l'instant : l'export de l'Ain (data.gouv.fr) n'a pas
 * pu être relu le 18/10, le serveur coupant les connexions — on n'embarque
 * pas un jeu qu'on n'a pas lu.
 */
const JEUX_PAR_ZONE: Readonly<Record<string, JeuPdipr>> = {
  isere: { fichier: 'data/pdipr-isere.json', emprise: EMPRISE_ISERE },
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
): FeatureCollection<LineString> {
  const reseau = reseauVide()
  const features = (data as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return reseau

  for (const brute of features as unknown[]) {
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
