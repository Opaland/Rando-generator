import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../lib/maplibreSetup.ts'
import { useAppStore } from '../store/appStore.ts'
import { useMapCamera } from './map/useMapCamera.ts'
import { useMapInstance } from './map/useMapInstance.ts'
import { useMapInteractions } from './map/useMapInteractions.ts'
import { useMapSources } from './map/useMapSources.ts'
import { MapLegend } from './MapLegend.tsx'
import styles from './MapView.module.css'

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const drawMode = useAppStore((s) => s.drawMode)

  // La carte se lit en quatre hooks (src/components/map/) plutôt qu'en un
  // effet de cent vingt lignes : instance et repli de fond, interactions,
  // données, caméra.
  const { mapRef, ready, styleEpoch, mapError } = useMapInstance(containerRef)
  useMapInteractions(mapRef, drawMode)

  // Données et caméra : deux hooks dédiés (src/components/map/).
  useMapSources(mapRef, ready, styleEpoch)
  useMapCamera(mapRef, ready)

  // Curseur en croix pendant le tracé : le clic ne sert plus à naviguer.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getCanvas().style.cursor = drawMode ? 'crosshair' : ''
  }, [drawMode, ready, mapRef])

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
  }, [selectedItineraryId, ready, styleEpoch, mapRef])

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
