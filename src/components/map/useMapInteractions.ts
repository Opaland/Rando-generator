import { useEffect, useRef, type RefObject } from 'react'
import {
  Popup,
  type Map as MaplibreMap,
  type MapLayerMouseEvent,
  type MapGeoJSONFeature,
} from 'maplibre-gl'
import { useAppStore } from '../../store/appStore.ts'
import { poiPopupHtml, type PoiPopupProps } from './poiPopup.ts'

/** Couches d'itinéraires cliquables (le tracé « fait » couvre le tracé de base). */
const COUCHES_TRACES = ['trails-base', 'trails-done']

/**
 * Ce que la souris déclenche sur la carte : ouvrir une fiche, poser une
 * étape de tracé, afficher un point d'intérêt.
 *
 * Sorti de MapView (issue #9). Les gestionnaires sont installés une seule
 * fois, à la création de la carte : ils lisent le mode tracé via une ref
 * plutôt que par une closure figée au premier rendu.
 */
export function useMapInteractions(
  mapRef: RefObject<MaplibreMap | null>,
  drawMode: boolean,
): void {
  const drawModeRef = useRef(drawMode)
  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const mainPointeur = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const mainNeutre = () => {
      map.getCanvas().style.cursor = ''
    }

    // Cliquer un tracé sur la carte ouvre directement sa fiche détail
    // (profil altimétrique, points d'intérêt, vue 3D) ; la sélection depuis
    // la liste latérale, elle, ne fait que zoomer (cf. store.selectItinerary).
    const surTrace = (event: MapLayerMouseEvent) => {
      // En mode tracé, un clic pose une étape : ne pas ouvrir la fiche
      // détail par-dessus.
      if (drawModeRef.current) return
      const feature = event.features?.[0]
      const id = (feature?.properties as { itineraryId?: number } | undefined)
        ?.itineraryId
      if (typeof id === 'number') {
        useAppStore.getState().openItineraryDetail(id)
      }
    }
    for (const couche of COUCHES_TRACES) {
      map.on('click', couche, surTrace)
      map.on('mouseenter', couche, mainPointeur)
      map.on('mouseleave', couche, mainNeutre)
    }

    const surPoi = (
      event: MapLayerMouseEvent & { features?: MapGeoJSONFeature[] },
    ) => {
      const props = event.features?.[0]?.properties as PoiPopupProps | undefined
      new Popup({ closeButton: true, offset: 10 })
        .setLngLat(event.lngLat)
        .setHTML(poiPopupHtml(props))
        .addTo(map)
    }
    map.on('click', 'pois', surPoi)
    map.on('mouseenter', 'pois', mainPointeur)
    map.on('mouseleave', 'pois', mainNeutre)

    // Mode tracé : chaque clic sur la carte pose une étape, accrochée au
    // sentier le plus proche (le calcul de chemin vit dans le store).
    const surCarte = (event: MapLayerMouseEvent) => {
      if (!drawModeRef.current) return
      useAppStore.getState().addDrawPoint([event.lngLat.lng, event.lngLat.lat])
    }
    map.on('click', surCarte)

    return () => {
      for (const couche of COUCHES_TRACES) {
        map.off('click', couche, surTrace)
        map.off('mouseenter', couche, mainPointeur)
        map.off('mouseleave', couche, mainNeutre)
      }
      map.off('click', 'pois', surPoi)
      map.off('mouseenter', 'pois', mainPointeur)
      map.off('mouseleave', 'pois', mainNeutre)
      map.off('click', surCarte)
    }
    // La carte n'est créée qu'une fois ; les gestionnaires n'ont pas à être
    // réinstallés au changement de mode (la ref s'en charge).
  }, [mapRef])
}
