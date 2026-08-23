import type { FeatureCollection } from 'geojson'
import type {
  ExpressionSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import { POI_COLORS } from '../../lib/poiDisplay.ts'
import {
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../lib/networkDisplay.ts'
import {
  BLANC_BALISAGE,
  ENCRE,
  GRIS_VERT,
  PAPIER,
} from '../../lib/couleursPartagees.ts'
import type { PointOfInterest } from '../../core/types.ts'

/**
 * Fond de carte, couches et utilitaires GeoJSON de la carte.
 *
 * Séparé du composant : ce sont des données et des fonctions pures, elles
 * n'ont pas besoin du cycle de vie de React — et les 150 lignes de
 * déclaration de couches noyaient la logique du composant (issue #9).
 */

export const IGN_TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const ATTRIBUTION =
  'Fond © <a href="https://www.ign.fr/">IGN</a> (Plan IGN, licence ouverte Etalab) · Itinéraires © les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · Boucles locales © <a href="https://data.grandlyon.com/">Métropole de Lyon</a> (Licence Ouverte)'
export const ATTRIBUTION_OSM =
  'Fond et itinéraires © les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · Boucles locales © <a href="https://data.grandlyon.com/">Métropole de Lyon</a> (Licence Ouverte)'

const NETWORK_COLOR_MATCH: ExpressionSpecification = [
  'match',
  ['get', 'network'],
  'GR',
  NETWORK_COLORS.GR,
  'GRP',
  NETWORK_COLORS.GRP,
  'PR',
  NETWORK_COLORS.PR,
  'LOCAL',
  NETWORK_COLORS.LOCAL,
  'PERSO',
  NETWORK_COLORS.PERSO,
  GRIS_VERT,
]

export function baseStyle(tiles: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tiles],
        tileSize: 256,
        maxzoom: 18,
        attribution,
      },
      trails: { type: 'geojson', data: emptyCollection() },
      'trails-done': { type: 'geojson', data: emptyCollection() },
      'trails-declares': { type: 'geojson', data: emptyCollection() },
      tracks: { type: 'geojson', data: emptyCollection() },
      pois: { type: 'geojson', data: emptyCollection() },
      draw: { type: 'geojson', data: emptyCollection() },
      'draw-points': { type: 'geojson', data: emptyCollection() },
      'user-position': { type: 'geojson', data: emptyCollection() },
      'elevation-hover': { type: 'geojson', data: emptyCollection() },
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'basemap' },
      {
        // Liseré blanc sous les tracés : sans lui, un trait rouge sur un fond
        // topographique chargé devient illisible en plein soleil. Deux couches
        // superposées (large clair dessous, colorée dessus) — c'est la
        // technique de « casing », line-gap-width ferait tout autre chose.
        id: 'trails-casing',
        type: 'line',
        source: 'trails',
        paint: {
          'line-color': BLANC_BALISAGE,
          'line-width': 6,
          'line-opacity': 0.85,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'trails-base',
        type: 'line',
        source: 'trails',
        paint: {
          // Coloré par réseau (comme les tronçons parcourus, en plus discret)
          // dès le chargement de la zone : sans ça, rien ne distingue un GR
          // d'un PR tant qu'on n'a pas de trace GPS pour le prouver.
          'line-color': NETWORK_COLOR_MATCH,
          'line-width': 2,
          'line-opacity': 0.45,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        /*
          Les itinéraires déclarés parcourus (issue #158).

          Trait **discontinu**, dans la couleur de leur réseau : mesuré =
          plein, déclaré = pointillé. Le figuré distingue, la couleur
          continue de dire le réseau — ajouter un jeton de couleur pour
          « déclaré » referait l'erreur relevée par l'audit global, où deux
          couleurs étaient nées entre deux sprints sans décision.

          Posée sous `trails-done` dans l'ordre des couches : là où les deux
          se superposent, c'est le mesuré qu'on doit voir.
        */
        id: 'trails-declares',
        type: 'line',
        source: 'trails-declares',
        paint: {
          'line-color': NETWORK_COLOR_MATCH,
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
      },
      {
        id: 'trails-done',
        type: 'line',
        source: 'trails-done',
        paint: {
          'line-color': NETWORK_COLOR_MATCH,
          'line-width': 4,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'trails-selected',
        type: 'line',
        source: 'trails',
        filter: ['==', ['get', 'itineraryId'], -1],
        paint: {
          'line-color': ENCRE,
          'line-width': 6,
          'line-opacity': 0.35,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'tracks',
        type: 'line',
        source: 'tracks',
        paint: {
          'line-color': ENCRE,
          'line-width': 1.5,
          'line-opacity': 0.65,
          'line-dasharray': [1, 2],
        },
      },
      {
        id: 'pois',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': PAPIER,
        },
      },
      {
        id: 'draw-line',
        type: 'line',
        source: 'draw',
        paint: {
          'line-color': ENCRE,
          'line-width': 5,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      {
        id: 'draw-points',
        type: 'circle',
        source: 'draw-points',
        paint: {
          'circle-radius': 6,
          'circle-color': PAPIER,
          'circle-stroke-width': 3,
          'circle-stroke-color': ENCRE,
        },
      },
      {
        // Point survolé sur le profil altimétrique : le lien entre « ça
        // grimpe » et « ça grimpe *là* ».
        id: 'elevation-hover',
        type: 'circle',
        source: 'elevation-hover',
        paint: {
          'circle-radius': 6,
          /*
            Ce point valait `#c1272d` : un rouge qui ne correspondait à aucun
            jeton, à huit unités de clarté du rouge de balisage. Personne ne
            l'avait choisi contre lui — il avait été tapé, une fois, et
            recopié nulle part ailleurs. Le repère du profil et le tracé
            qu'il désigne sont le même objet vu deux fois : ils sont
            maintenant de la même couleur.
          */
          'circle-color': NETWORK_COLORS.GR,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': BLANC_BALISAGE,
        },
      },
      {
        // Position de l'utilisateur, au-dessus de tout le reste.
        id: 'user-position',
        type: 'circle',
        source: 'user-position',
        paint: {
          'circle-radius': 7,
          'circle-color': POSITION_COLOR,
          'circle-stroke-width': 3,
          'circle-stroke-color': BLANC_BALISAGE,
        },
      },
    ],
  }
}

export function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Échappe le HTML — les noms de POI viennent d'OSM, jamais fiables tels quels. */
/**
 * Échappe une chaîne destinée à du HTML.
 *
 * Écrit à la main plutôt qu'en passant par `textContent`/`innerHTML` : cette
 * fonction n'a alors plus besoin d'un document, donc elle s'éprouve en test
 * unitaire — et elle échappe aussi les guillemets, ce que le détour par le
 * DOM ne faisait pas.
 */
const ENTITES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (caractere) => ENTITES[caractere] ?? caractere)
}

export function poisToGeoJSON(pois: PointOfInterest[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [poi.lon, poi.lat] },
      properties: {
        name: poi.name,
        kind: poi.kind,
        capacity: poi.details.capacity,
        color: POI_COLORS[poi.kind],
      },
    })),
  }
}
