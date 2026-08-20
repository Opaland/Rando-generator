import type { LonLat } from './types.ts'

/**
 * Lecture d'un GeoJSON de sentiers.
 *
 * Les PDIPR départementaux — Ain, Isère, et les autres à mesure qu'ils
 * s'ouvrent — sont publiés en GeoJSON (issue #87). Plutôt qu'un lecteur par
 * département, chacun avec son schéma, on lit le format : la géométrie y est
 * normalisée, seuls les noms de colonnes varient d'un producteur à l'autre.
 *
 * L'utilisateur télécharge le fichier chez le producteur et le dépose ici.
 * C'est la même logique que pour les archives d'export (#89) : la donnée
 * vient à l'application, l'application ne va pas la chercher.
 */

export class GeoJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeoJsonError'
  }
}

/**
 * Intitulés rencontrés dans les jeux français, par ordre de préférence.
 * Cette liste est ouverte : un nom inconnu donne un itinéraire sans nom, pas
 * une erreur.
 */
const CLES_DE_NOM = [
  'nom',
  'name',
  'libelle',
  'libellé',
  'intitule',
  'intitulé',
  'titre',
  'label',
  'denomination',
  'dénomination',
]

export interface GeoJsonTrail {
  name: string | null
  /** Un itinéraire peut être décrit en plusieurs tronçons. */
  lines: LonLat[][]
}

interface Geometrie {
  type?: string
  coordinates?: unknown
}

interface Feature {
  type?: string
  properties?: Record<string, unknown> | null
  geometry?: Geometrie | null
}

function estLonLat(valeur: unknown): valeur is LonLat {
  return (
    Array.isArray(valeur) &&
    typeof valeur[0] === 'number' &&
    typeof valeur[1] === 'number' &&
    Math.abs(valeur[0]) <= 180 &&
    Math.abs(valeur[1]) <= 90
  )
}

/** Une coordonnée hors des bornes WGS84 : projection métrique, pas un bug. */
function estProjetee(valeur: unknown): boolean {
  return (
    Array.isArray(valeur) &&
    typeof valeur[0] === 'number' &&
    typeof valeur[1] === 'number' &&
    (Math.abs(valeur[0]) > 180 || Math.abs(valeur[1]) > 90)
  )
}

function nomDe(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null
  for (const cle of CLES_DE_NOM) {
    const valeur = properties[cle]
    if (typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim()
  }
  return null
}

/** Extrait les lignes d'une géométrie ; rend un tableau vide pour le reste. */
function lignesDe(geometry: Geometrie | null | undefined): LonLat[][] {
  if (!geometry) return []
  const brut = geometry.coordinates
  if (!Array.isArray(brut)) return []
  const candidates: unknown[][] =
    geometry.type === 'LineString'
      ? [brut]
      : geometry.type === 'MultiLineString'
        ? (brut as unknown[][])
        : []

  const lignes: LonLat[][] = []
  for (const ligne of candidates) {
    if (!Array.isArray(ligne)) continue
    if (ligne.some(estProjetee)) {
      throw new GeoJsonError(
        'Ce fichier semble être projeté (Lambert 93 ou similaire) et non en ' +
          'coordonnées géographiques. Reprojetez-le en WGS84 (EPSG:4326) ' +
          'avant de l’importer.',
      )
    }
    // Une ligne d'un seul point ne trace rien : on l'écarte sans bruit.
    if (ligne.length < 2 || !ligne.every(estLonLat)) continue
    lignes.push(ligne.map((p) => [p[0], p[1]] as LonLat))
  }
  return lignes
}

/** Vrai si le texte ressemble à du GeoJSON, sans le parser entièrement. */
export function looksLikeGeoJson(text: string): boolean {
  const debut = text.slice(0, 4096)
  if (!debut.includes('"type"')) return false
  return (
    debut.includes('"FeatureCollection"') ||
    debut.includes('"Feature"') ||
    debut.includes('"LineString"') ||
    debut.includes('"MultiLineString"')
  )
}

export function parseGeoJsonTrails(data: unknown): GeoJsonTrail[] {
  if (typeof data !== 'object' || data === null) {
    throw new GeoJsonError('Ce fichier n’est pas un GeoJSON.')
  }

  const racine = data as Feature & { features?: unknown }
  const features: Feature[] =
    racine.type === 'FeatureCollection'
      ? Array.isArray(racine.features)
        ? (racine.features as Feature[])
        : []
      : racine.type === 'Feature'
        ? [racine]
        : racine.type === 'LineString' || racine.type === 'MultiLineString'
          ? [{ type: 'Feature', geometry: racine }]
          : (() => {
              throw new GeoJsonError(
                'Ce fichier n’est pas un GeoJSON de sentiers (ni FeatureCollection, ni Feature, ni géométrie).',
              )
            })()

  const trails: GeoJsonTrail[] = []
  for (const feature of features) {
    const lines = lignesDe(feature.geometry)
    if (lines.length === 0) continue
    trails.push({ name: nomDe(feature.properties), lines })
  }
  return trails
}
