import { useEffect, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import {
  Map as MaplibreMap,
  NavigationControl,
  LngLatBounds,
  Popup,
  type ErrorEvent as MapErrorEvent,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import type {
  ExpressionSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../lib/maplibreSetup.ts'
import {
  buildTrailGeoJSON,
  buildTracksGeoJSON,
  itineraryCoords,
} from '../core/mapdata.ts'
import { bearingDegrees } from '../core/geo.ts'
import { useAppStore } from '../store/appStore.ts'
import { POI_COLORS, POI_LABELS } from '../lib/poiDisplay.ts'
import { NETWORK_COLORS } from '../lib/networkDisplay.ts'
import type { LonLat, PoiKind, PointOfInterest } from '../core/types.ts'
import { MapLegend } from './MapLegend.tsx'
import styles from './MapView.module.css'

const IGN_TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

const ATTRIBUTION =
  'Fond © <a href="https://www.ign.fr/">IGN</a> (Plan IGN, licence ouverte Etalab) · Itinéraires © les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL) · Boucles locales © <a href="https://data.grandlyon.com/">Métropole de Lyon</a> (Licence Ouverte)'
const ATTRIBUTION_OSM =
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
  '#5a6b5d',
]

function baseStyle(tiles: string, attribution: string): StyleSpecification {
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
      tracks: { type: 'geojson', data: emptyCollection() },
      pois: { type: 'geojson', data: emptyCollection() },
      draw: { type: 'geojson', data: emptyCollection() },
      'draw-points': { type: 'geojson', data: emptyCollection() },
      'user-position': { type: 'geojson', data: emptyCollection() },
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
          'line-color': '#ffffff',
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
          'line-color': '#1e2b23',
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
          'line-color': '#1e2b23',
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
          'circle-stroke-color': '#faf7f2',
        },
      },
      {
        id: 'draw-line',
        type: 'line',
        source: 'draw',
        paint: {
          'line-color': '#1e2b23',
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
          'circle-color': '#faf7f2',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#1e2b23',
        },
      },
      {
        // Position de l'utilisateur, au-dessus de tout le reste.
        id: 'user-position',
        type: 'circle',
        source: 'user-position',
        paint: {
          'circle-radius': 7,
          'circle-color': '#1d6fa5',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      },
    ],
  }
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Échappe le HTML — les noms de POI viennent d'OSM, jamais fiables tels quels. */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function poisToGeoJSON(pois: PointOfInterest[]): FeatureCollection {
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

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const [ready, setReady] = useState(false)
  // Incrémenté à chaque style.load (repli OSM) : les sources recréées par
  // setStyle repartent vides, les effets de données doivent se rejouer.
  const [styleEpoch, setStyleEpoch] = useState(0)
  const fallbackDone = useRef(false)
  const tileErrors = useRef(0)

  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const customMatching = useAppStore((s) => s.customMatching)
  const tracks = useAppStore((s) => s.tracks)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const detailItineraryId = useAppStore((s) => s.detailItineraryId)
  const pois = useAppStore((s) => s.pois)
  const view3D = useAppStore((s) => s.view3D)
  const focusTarget = useAppStore((s) => s.focusTarget)
  const userPosition = useAppStore((s) => s.userPosition)
  const drawMode = useAppStore((s) => s.drawMode)
  const drawPath = useAppStore((s) => s.drawPath)
  const drawWaypoints = useAppStore((s) => s.drawWaypoints)
  // Le gestionnaire de clic est installé une seule fois : il lit le mode
  // tracé via une ref plutôt que par une closure figée au premier rendu.
  const drawModeRef = useRef(drawMode)
  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  const [mapError, setMapError] = useState(false)

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: MaplibreMap
    try {
      map = new MaplibreMap({
        container: containerRef.current,
        style: baseStyle(IGN_TILES, ATTRIBUTION),
        center: [4.55, 45.5],
        zoom: 9,
        attributionControl: { compact: false },
      })
    } catch {
      // WebGL indisponible : l'application reste utilisable sans carte.
      // (asynchrone pour ne pas déclencher un re-rendu en cascade dans l'effet)
      queueMicrotask(() => {
        setMapError(true)
      })
      return
    }
    map.addControl(new NavigationControl(), 'top-right')
    mapRef.current = map
    // Exposé en lecture pour les tests e2e (état du fond de carte et des sources).
    ;(window as { __sentiersMap?: MaplibreMap }).__sentiersMap = map

    map.on('load', () => {
      setReady(true)
    })

    map.on('style.load', () => {
      setStyleEpoch((epoch) => epoch + 1)
    })

    // Repli automatique sur les tuiles OSM si le flux IGN échoue.
    map.on('error', (event: MapErrorEvent) => {
      const sourceId = (event as { sourceId?: string }).sourceId
      if (sourceId !== 'basemap' || fallbackDone.current) return
      tileErrors.current += 1
      if (tileErrors.current >= 3) {
        fallbackDone.current = true
        map.setStyle(baseStyle(OSM_TILES, ATTRIBUTION_OSM))
      }
    })

    // Cliquer un tracé sur la carte ouvre directement sa fiche détail
    // (profil altimétrique, points d'intérêt, vue 3D) ; la sélection depuis
    // la liste latérale, elle, ne fait que zoomer (cf. store.selectItinerary).
    const handleClick = (event: MapLayerMouseEvent) => {
      // En mode tracé, un clic pose une étape (géré plus bas) : ne pas
      // ouvrir la fiche détail par-dessus.
      if (drawModeRef.current) return
      const feature = event.features?.[0]
      const id = (feature?.properties as { itineraryId?: number } | undefined)
        ?.itineraryId
      if (typeof id === 'number') {
        useAppStore.getState().openItineraryDetail(id)
      }
    }
    for (const layer of ['trails-base', 'trails-done']) {
      map.on('click', layer, handleClick)
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    const handlePoiClick = (
      event: MapLayerMouseEvent & { features?: MapGeoJSONFeature[] },
    ) => {
      const props = event.features?.[0]?.properties as
        | { name?: string; kind?: PoiKind; capacity?: string | null }
        | undefined
      const kindLabel = props?.kind ? POI_LABELS[props.kind] : 'Point d’intérêt'
      const capacity = props?.capacity
        ? ` · ${escapeHtml(props.capacity)} places`
        : ''
      new Popup({ closeButton: true, offset: 10 })
        .setLngLat(event.lngLat)
        .setHTML(
          `<strong>${escapeHtml(props?.name ?? kindLabel)}</strong>` +
            (props?.name
              ? `<br><span>${escapeHtml(kindLabel)}${capacity}</span>`
              : capacity && `<br><span>${kindLabel}${capacity}</span>`),
        )
        .addTo(map)
    }
    // Mode tracé : chaque clic sur la carte pose une étape, accrochée au
    // sentier le plus proche (le calcul de chemin vit dans le store).
    map.on('click', (event) => {
      if (!drawModeRef.current) return
      useAppStore.getState().addDrawPoint([event.lngLat.lng, event.lngLat.lat])
    })

    map.on('click', 'pois', handlePoiClick)
    map.on('mouseenter', 'pois', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'pois', () => {
      map.getCanvas().style.cursor = ''
    })

    return () => {
      delete (window as { __sentiersMap?: MaplibreMap }).__sentiersMap
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Mise à jour des couches quand les données changent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const apply = () => {
      const { base, done } = buildTrailGeoJSON(
        itineraries,
        matching?.samples ?? [],
      )
      // Les itinéraires persos ont leur propre matching : on fusionne leurs
      // features dans les mêmes couches.
      const custom = buildTrailGeoJSON(
        customItineraries,
        customMatching?.samples ?? [],
      )
      base.features.push(...custom.base.features)
      done.features.push(...custom.done.features)
      void map.getSource<GeoJSONSource>('trails')?.setData(base)
      void map.getSource<GeoJSONSource>('trails-done')?.setData(done)
      void map
        .getSource<GeoJSONSource>('tracks')
        ?.setData(buildTracksGeoJSON(tracks))
      void map.getSource<GeoJSONSource>('pois')?.setData(poisToGeoJSON(pois))
      // Témoin pour les tests e2e : quelles données ont été appliquées, et
      // sur quelle génération de style (permet de vérifier la ré-application
      // après le repli de fond de carte).
      ;(
        window as {
          __sentiersTrailStats?: { base: number; done: number; styleEpoch: number }
        }
      ).__sentiersTrailStats = {
        base: base.features.length,
        done: done.features.length,
        styleEpoch,
      }
    }
    // Après un setStyle (repli OSM), les sources se rechargent : on ré-applique.
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [
    itineraries,
    customItineraries,
    matching,
    customMatching,
    tracks,
    pois,
    ready,
    styleEpoch,
  ])

  // Cadrage sur la zone chargée (ou sur les itinéraires persos sans zone).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = itineraries.length > 0 ? itineraries : customItineraries
    if (source.length === 0) return
    const bounds = new LngLatBounds()
    for (const itin of source) {
      for (const way of itin.ways) {
        for (const [lon, lat] of way.coords) bounds.extend([lon, lat])
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 48, duration: 400 })
    }
  }, [itineraries, customItineraries, ready])

  // Zoom sur l'itinéraire quand il est sélectionné (liste ou clic carte).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || selectedItineraryId === null) return
    const itin =
      itineraries.find((i) => i.osmRelationId === selectedItineraryId) ??
      customItineraries.find((i) => i.osmRelationId === selectedItineraryId)
    if (!itin) return
    const bounds = new LngLatBounds()
    for (const [lon, lat] of itineraryCoords(itin)) bounds.extend([lon, lat])
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, duration: 500, maxZoom: 15 })
    }
    // Ne dépend QUE de la sélection : re-zoomer sur les mêmes coordonnées à
    // chaque recalcul de matching serait agaçant (perte de la position pan/zoom
    // de l'utilisateur pendant qu'il regarde la carte).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItineraryId, ready])

  // Vue 3D : incline la caméra sur l'itinéraire en fiche détail, dans le sens
  // du premier tronçon. Reste une perspective (pitch/bearing MapLibre), pas
  // un relief calculé à partir d'un modèle numérique de terrain.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!view3D || detailItineraryId === null) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 })
      return
    }
    const itin =
      itineraries.find((i) => i.osmRelationId === detailItineraryId) ??
      customItineraries.find((i) => i.osmRelationId === detailItineraryId)
    const coords = itin ? itineraryCoords(itin) : []
    if (coords.length < 2) return
    const bearing = bearingDegrees(coords[0] as LonLat, coords[1] as LonLat)
    const bounds = new LngLatBounds()
    for (const [lon, lat] of coords) bounds.extend([lon, lat])
    const center = bounds.isEmpty() ? map.getCenter() : bounds.getCenter()
    map.easeTo({ center, pitch: 60, bearing, duration: 900 })
  }, [view3D, detailItineraryId, itineraries, customItineraries, ready])

  // Tracé en cours : ligne calculée + étapes posées.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const apply = () => {
      void map.getSource<GeoJSONSource>('draw')?.setData({
        type: 'FeatureCollection',
        features:
          drawPath.length >= 2
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: drawPath },
                  properties: {},
                },
              ]
            : [],
      })
      void map.getSource<GeoJSONSource>('draw-points')?.setData({
        type: 'FeatureCollection',
        features: drawWaypoints.map((coord) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties: {},
        })),
      })
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [drawPath, drawWaypoints, ready, styleEpoch])

  // Position de l'utilisateur.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const apply = () => {
      void map.getSource<GeoJSONSource>('user-position')?.setData({
        type: 'FeatureCollection',
        features: userPosition
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [userPosition.lon, userPosition.lat],
                },
                properties: {},
              },
            ]
          : [],
      })
    }
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [userPosition, ready, styleEpoch])

  // Curseur en croix pendant le tracé : le clic ne sert plus à naviguer.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getCanvas().style.cursor = drawMode ? 'crosshair' : ''
  }, [drawMode, ready])

  // Centre la carte sur un point d'intérêt cliqué dans la fiche détail
  // (consommé une seule fois : on efface la cible aussitôt après usage).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focusTarget) return
    map.easeTo({
      center: focusTarget,
      zoom: Math.max(map.getZoom(), 15),
      duration: 500,
    })
    useAppStore.getState().clearFocusTarget()
  }, [focusTarget, ready])

  // Surlignage de l'itinéraire sélectionné.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const applyFilter = () => {
      if (!map.getLayer('trails-selected')) return
      // `itineraryIds` liste tous les itinéraires passant par le way : le
      // surlignage couvre aussi les tronçons partagés.
      map.setFilter('trails-selected', [
        'in',
        selectedItineraryId ?? -1,
        ['get', 'itineraryIds'],
      ])
    }
    if (map.isStyleLoaded()) applyFilter()
    else map.once('idle', applyFilter)
  }, [selectedItineraryId, ready, styleEpoch])

  useEffect(() => {
    // Échap désélectionne l'itinéraire (navigation clavier).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectItinerary(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [selectItinerary])

  return (
    <div
      ref={containerRef}
      className={styles.map}
      data-testid="map"
      role="application"
      aria-label="Carte des itinéraires de randonnée"
    >
      {mapError && (
        <p className={styles.mapError} role="alert">
          La carte ne peut pas s’afficher (accélération graphique
          indisponible). Les statistiques et les listes restent utilisables ;
          essayez un autre navigateur pour voir la carte.
        </p>
      )}
      {!mapError && (itineraries.length > 0 || customItineraries.length > 0) && (
        <MapLegend />
      )}
    </div>
  )
}

// Export par défaut pour le chargement différé (React.lazy).
export default MapView
