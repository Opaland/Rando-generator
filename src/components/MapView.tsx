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

  /**
   * Réserve, en pixels, la bande que l'attribution occupe en bas de la carte.
   *
   * C'est la distance entre le bas de la carte et le **haut** du bandeau
   * d'attribution : sa hauteur propre, plus tout ce qui le pousse vers le
   * haut — la barre d'onglets et la poignée de la feuille sur téléphone.
   * Un seul nombre, qui n'a pas à connaître ces paliers.
   *
   * Rien de tout cela n'est constant : mesuré sur l'application,
   * l'attribution occupe 64 px sur un téléphone de 390 px (trois lignes),
   * 44 px entre 800 et 1280 (deux lignes), 24 px à partir de 1600 (une
   * seule), et davantage en gros texte (issue #173).
   *
   * L'attribution est exigée par l'ODbL et la Licence Ouverte : rien ne se
   * pose dessus. Les surimpressions ancrées en bas lisent donc cette valeur
   * au lieu de deviner (AUDIT_UX.md, constat U4).
   *
   * La première version n'exposait que la hauteur du bandeau. Elle suffisait
   * au bouton « Ma position » et pas au guide de premier lancement, qui se
   * pose au milieu du cadre et dont le bas retombait dessus — trouvé à la
   * revue, en regardant l'application plutôt que le diff.
   *
   * Posée sur la racine et non sur le conteneur de la carte : le bouton
   * « Ma position » est un **frère** de la carte, pas un descendant, et une
   * propriété personnalisée ne remonte pas. Posée sur le conteneur, elle ne
   * l'atteignait pas — et le bouton restait sur l'attribution sans que rien
   * ne le dise. C'est déjà là que vivent `data-mode` et `data-maquette`.
   */
  useEffect(() => {
    const conteneur = containerRef.current
    if (!conteneur) return
    const bandeau = conteneur.querySelector('.maplibregl-ctrl-bottom-right')
    if (!bandeau || typeof ResizeObserver === 'undefined') return
    const racine = document.documentElement
    const mesurer = () => {
      const basDeLaCarte = conteneur.getBoundingClientRect().bottom
      const hautDuBandeau = bandeau.getBoundingClientRect().top
      racine.style.setProperty(
        '--bande-attribution',
        `${String(Math.max(0, Math.ceil(basDeLaCarte - hautDuBandeau)))}px`,
      )
    }
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(bandeau)
    observateur.observe(conteneur)
    return () => {
      observateur.disconnect()
      racine.style.removeProperty('--bande-attribution')
    }
  }, [ready])

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
      {/*
        Ce qui rend une légende utile est décidé par la légende elle-même
        (`core/legende`), et non ici. La condition vivait aux deux endroits :
        `MapView` la montait dès qu'il y avait un itinéraire, `MapLegend`
        décidait ensuite quoi montrer. La seconde question ne pouvait donc
        jamais répondre « rien », et sa garde était du code mort — trouvé
        parce qu'une mutation l'a supprimée sans faire rougir un test
        (CLAUDE.md §4 et §6bis).

        Effet de bord voulu : des traces importées sans zone chargée ont
        maintenant leur légende — « parcouru » et « restant » veulent dire
        quelque chose dès qu'une trace est là.
      */}
      {!mapError && <MapLegend />}
    </div>
  )
}

// Export par défaut pour le chargement différé (React.lazy).
export default MapView
