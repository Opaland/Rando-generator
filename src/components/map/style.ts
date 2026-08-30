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
import {
  attributionHtml,
  IGN,
  METROPOLE,
  OSM,
  OSM_FOND_ET_TRACES,
} from '../../lib/attribution.ts'
import { ORDRE_DES_RESEAUX } from '../../core/reseaux.ts'
import type { Itinerary, PointOfInterest } from '../../core/types.ts'
import { segmentsDeRevetement } from '../../core/revetement.ts'
import {
  TERRAIN_COLORS,
  TERRAIN_TIRETS,
} from '../../lib/revetementDisplay.ts'

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

/*
  Composées, plus recopiées (issue #386). Les chaînes rendues sont exactement
  celles qui étaient écrites ici — `tests/unit/attribution.test.ts` les épingle
  au caractère près — et les morceaux vivent désormais dans un seul fichier,
  d'où la feuille d'impression les tire aussi.
*/
export const ATTRIBUTION = attributionHtml(IGN, OSM, METROPOLE)
export const ATTRIBUTION_OSM = attributionHtml(OSM_FOND_ET_TRACES, METROPOLE)

/**
 * La couleur d'un tracé, par réseau — **dérivée**, jamais énumérée (#412).
 *
 * Elle l'était, et il en manquait un : `INCONNU` n'était pas dans la liste et
 * tombait donc dans le repli. La carte peignait `#5a6b5d` là où le badge, la
 * légende et la barre de progression peignaient `#882a5a` — ΔE 56,2. Pire, ce
 * gris est à ΔE 13,9 du « dur » et 12,2 de l'« autre » des bandes de terrain,
 * soit **plus proche** que le gris neutre que #284 avait mesuré puis refusé
 * pour cette raison exacte.
 *
 * Cette table était la quatrième copie de la palette, à côté des trois que
 * `scripts/listes-jumelles.mjs` tient d'accord. Elle n'en est plus une : le
 * §4ter préfère une dérivation à une garde, parce qu'une dérivation ne peut
 * pas oublier.
 *
 * Le repli reste, parce que `match` en exige un — il ne couvre qu'une valeur
 * qui ne serait pas un réseau, ce que `mapdata` ne produit pas.
 */
const NETWORK_COLOR_MATCH = [
  'match',
  ['get', 'network'],
  ...ORDRE_DES_RESEAUX.flatMap((reseau) => [reseau, NETWORK_COLORS[reseau]]),
  GRIS_VERT,
  /*
    La conversion large, et ce qui la rachète.

    Le type de `match` chez MapLibre est un n-uplet : il exige nommément ses
    deux premières branches, et une liste construite par `flatMap` ne peut pas
    lui prouver qu'elle en contient au moins une. TypeScript refuse donc la
    conversion directe, et il a raison — c'est bien une réinterprétation.

    Ce que le compilateur ne vérifie plus, `tests/unit/reseauxSurLaCarte.test.ts`
    le vérifie à l'exécution : que la table est bien un `match`, que chaque
    réseau y est, avec sa couleur, et que le style entier passe le validateur
    officiel du style-spec. Une garde perdue se remplace, elle ne se raye pas.
  */
] as unknown as ExpressionSpecification

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
      'trails-revetement': { type: 'geojson', data: emptyCollection() },
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
          Le terrain, en bande le long du tracé (demande du 24/08).

          Le revêtement n'existait que dans le profil altimétrique — c'est-à-
          dire seulement quand on ouvre une fiche, et seulement en regardant
          ailleurs que la carte. « Il faudrait également avoir la couleur du
          terrain sur la carte », et c'était juste : ce qu'on a sous les
          pieds se décide en regardant où l'on va.

          **Une bande décalée, et non le tracé recoloré.** La couleur du
          tracé dit le réseau — c'est le code le plus ancien de
          l'application, celui qu'on lit sur les arbres. La remplacer par le
          revêtement échangerait une information contre une autre. Le décalage
          reprend le vocabulaire du profil, où la bande court sous la courbe
          sans la remplacer.

          Trois pixels sous le tracé : assez pour se lire au zoom où l'on
          regarde un sentier, assez peu pour rester attaché à lui.
        */
        id: 'trails-revetement',
        type: 'line',
        source: 'trails-revetement',
        filter: ['!=', ['get', 'tirets'], true],
        paint: {
          'line-color': ['get', 'couleur'] as unknown as ExpressionSpecification,
          'line-width': 2.5,
          'line-offset': 4,
          'line-opacity': 0.85,
        },
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
      },
      {
        /*
          « Autre revêtement » : la même bande, en tirets.

          Cette famille est une valeur qu'OpenStreetMap connaît mais que la
          table ne classe pas. Son travail est d'avoir l'air neutre — donc
          d'être grise, donc d'être proche du gris de « dur ». Trois essais
          l'ont confirmé : la rapprocher assez pour être distinguée lui
          faisait perdre sa neutralité.

          Elle se distingue donc par la **forme**, ce qui tient sans la
          couleur — pour qui ne sépare pas les gris comme pour qui regarde au
          soleil. C'est la même distinction que le témoin d'enregistrement,
          plein en marche et creux en pause.
        */
        id: 'trails-revetement-autre',
        type: 'line',
        source: 'trails-revetement',
        filter: ['==', ['get', 'tirets'], true],
        paint: {
          'line-color': ['get', 'couleur'] as unknown as ExpressionSpecification,
          'line-width': 2.5,
          'line-offset': 4,
          'line-opacity': 0.85,
          'line-dasharray': [3, 3],
        },
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
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

/**
 * Le terrain d'un itinéraire, prêt à peindre.
 *
 * La couleur est calculée ici plutôt que dans une expression MapLibre : le
 * code couleur vit dans `lib/revetementDisplay.ts`, avec ses règles
 * mesurées, et une table `match` recopiée dans le style aurait été la
 * cinquième copie que CLAUDE.md §4 décrit.
 *
 * `null` ne se peint pas — l'inconnu n'a pas de couleur, et deux tiers d'un
 * parcours n'ont pas de revêtement renseigné. Peindre l'ignorance la ferait
 * passer pour une valeur.
 */
export function revetementToGeoJSON(
  itineraries: Itinerary[],
): FeatureCollection {
  const features: FeatureCollection['features'] = []
  for (const itin of itineraries) {
    for (const segment of segmentsDeRevetement(itin)) {
      const couleur = TERRAIN_COLORS[segment.famille]
      if (couleur === null) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.coords },
        properties: {
          famille: segment.famille,
          origine: segment.origine,
          couleur,
          tirets: TERRAIN_TIRETS.includes(segment.famille),
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
