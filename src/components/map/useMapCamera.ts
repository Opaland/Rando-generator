import { useEffect, type RefObject } from 'react'
import { LngLatBounds, type Map as MaplibreMap } from 'maplibre-gl'
import { itineraryCoords } from '../../core/mapdata.ts'
import { bearingDegrees } from '../../core/geo.ts'
import { useAppStore } from '../../store/appStore.ts'
import type { LonLat } from '../../core/types.ts'

/**
 * Tout ce qui déplace la caméra : cadrage de la zone, zoom sur la sélection,
 * vue 3D, recentrages demandés depuis la fiche détail.
 *
 * Regroupé ici parce que ces effets se disputent la même ressource — la
 * position de la caméra — et qu'il vaut mieux les lire les uns à côté des
 * autres que dispersés dans un composant de 600 lignes (issue #9).
 */
export function useMapCamera(
  mapRef: RefObject<MaplibreMap | null>,
  ready: boolean,
): void {
  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const detailItineraryId = useAppStore((s) => s.detailItineraryId)
  const view3D = useAppStore((s) => s.view3D)
  const focusTarget = useAppStore((s) => s.focusTarget)
  const focusBounds = useAppStore((s) => s.focusBounds)

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
  }, [mapRef, itineraries, customItineraries, ready])

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
  }, [mapRef, selectedItineraryId, ready])

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
  }, [mapRef, view3D, detailItineraryId, itineraries, customItineraries, ready])


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
  }, [mapRef, focusTarget, ready])

  // Cadre une étape d'un long itinéraire : un point centré ne dirait pas
  // jusqu'où elle va.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focusBounds) return
    map.fitBounds(focusBounds, { padding: 48, duration: 500, maxZoom: 14 })
    useAppStore.getState().clearFocusBounds()
  }, [mapRef, focusBounds, ready])

}
