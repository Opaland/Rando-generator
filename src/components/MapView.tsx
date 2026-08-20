import { useEffect, useRef, useState } from 'react'
import {
  Map as MaplibreMap,
  NavigationControl,
  Popup,
  type ErrorEvent as MapErrorEvent,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../lib/maplibreSetup.ts'
import { useAppStore } from '../store/appStore.ts'
import { POI_LABELS } from '../lib/poiDisplay.ts'
import type { PoiKind } from '../core/types.ts'
import {
  ATTRIBUTION,
  ATTRIBUTION_OSM,
  IGN_TILES,
  OSM_TILES,
  baseStyle,
  escapeHtml,
} from './map/style.ts'
import { useMapCamera } from './map/useMapCamera.ts'
import { useMapSources } from './map/useMapSources.ts'
import { MapLegend } from './MapLegend.tsx'
import styles from './MapView.module.css'


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
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const drawMode = useAppStore((s) => s.drawMode)
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
        // Attribution laissée au comportement par défaut de MapLibre :
        // dépliée sur grand écran, repliée derrière un « ⓘ » en dessous de
        // 640 px. Forcée dépliée, elle occupait trois lignes et 60 px en bas
        // de carte sur téléphone, par-dessus la légende et l'état d'accueil
        // (docs/AUDIT_MOBILE.md, constat M7). Elle reste accessible : c'est
        // une obligation ODbL et Licence Ouverte, pas un ornement.
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


  // Données et caméra : deux hooks dédiés (src/components/map/).
  useMapSources(mapRef, ready, styleEpoch)
  useMapCamera(mapRef, ready)

  // Curseur en croix pendant le tracé : le clic ne sert plus à naviguer.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getCanvas().style.cursor = drawMode ? 'crosshair' : ''
  }, [drawMode, ready])

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
      /*
        Pas role="application" : ce rôle demande au lecteur d'écran de rendre
        toutes les touches à la page, et n'a de sens que si la page les gère.
        Ici les tracés ne s'ouvrent qu'au clic — l'utilisateur de lecteur
        d'écran y perdait ses raccourcis de navigation en échange de rien.

        Tout ce que la carte permet est atteignable depuis la liste latérale :
        sélectionner un itinéraire, le zoomer, ouvrir sa fiche et ses points
        d'intérêt. La carte s'annonce donc pour ce qu'elle est, une région.
      */
      role="region"
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
