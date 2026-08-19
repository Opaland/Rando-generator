import { useEffect, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import {
  Map as MaplibreMap,
  NavigationControl,
  LngLatBounds,
  type ErrorEvent as MapErrorEvent,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import type {
  ExpressionSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildTrailGeoJSON, buildTracksGeoJSON } from '../core/mapdata.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './MapView.module.css'

const IGN_TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

const ATTRIBUTION =
  'Fond © <a href="https://www.ign.fr/">IGN</a> (Plan IGN, licence ouverte Etalab) · Itinéraires © les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL)'
const ATTRIBUTION_OSM =
  'Fond et itinéraires © les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL)'

const NETWORK_COLOR_MATCH: ExpressionSpecification = [
  'match',
  ['get', 'network'],
  'GR',
  '#c8102e',
  'GRP',
  '#ce5a12',
  'PR',
  '#d9a400',
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
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'basemap' },
      {
        id: 'trails-base',
        type: 'line',
        source: 'trails',
        paint: {
          'line-color': '#5a6b5d',
          'line-width': 2,
          'line-opacity': 0.55,
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
    ],
  }
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const fallbackDone = useRef(false)
  const tileErrors = useRef(0)

  const itineraries = useAppStore((s) => s.itineraries)
  const matching = useAppStore((s) => s.matching)
  const tracks = useAppStore((s) => s.tracks)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new MaplibreMap({
      container: containerRef.current,
      style: baseStyle(IGN_TILES, ATTRIBUTION),
      center: [4.55, 45.5],
      zoom: 9,
      attributionControl: { compact: false },
    })
    map.addControl(new NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      setReady(true)
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

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      const id = (feature?.properties as { itineraryId?: number } | undefined)
        ?.itineraryId
      if (typeof id === 'number') {
        useAppStore.getState().selectItinerary(id)
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

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Mise à jour des couches quand les données changent.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const apply = () => {
      const samples = matching?.samples ?? []
      const { base, done } = buildTrailGeoJSON(itineraries, samples)
      void map.getSource<GeoJSONSource>('trails')?.setData(base)
      void map.getSource<GeoJSONSource>('trails-done')?.setData(done)
      void map
        .getSource<GeoJSONSource>('tracks')
        ?.setData(buildTracksGeoJSON(tracks))
    }
    // Après un setStyle (repli OSM), les sources se rechargent : on ré-applique.
    if (map.isStyleLoaded()) apply()
    else map.once('idle', apply)
  }, [itineraries, matching, tracks, ready])

  // Cadrage sur la zone chargée.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || itineraries.length === 0) return
    const bounds = new LngLatBounds()
    for (const itin of itineraries) {
      for (const way of itin.ways) {
        for (const [lon, lat] of way.coords) bounds.extend([lon, lat])
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 48, duration: 400 })
    }
  }, [itineraries, ready])

  // Surlignage de l'itinéraire sélectionné.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const applyFilter = () => {
      if (!map.getLayer('trails-selected')) return
      map.setFilter('trails-selected', [
        '==',
        ['get', 'itineraryId'],
        selectedItineraryId ?? -1,
      ])
    }
    if (map.isStyleLoaded()) applyFilter()
    else map.once('idle', applyFilter)
  }, [selectedItineraryId, ready])

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
    />
  )
}
