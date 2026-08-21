import { useEffect, type RefObject } from 'react'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import {
  buildTrailGeoJSON,
  buildTracksGeoJSON,
} from '../../core/mapdata.ts'
import { useAppStore } from '../../store/appStore.ts'
import { poisToGeoJSON } from './style.ts'

/**
 * Pousse les données de l'application dans les sources GeoJSON de la carte.
 *
 * Toutes ces mises à jour partagent la même précaution : après un setStyle
 * (repli sur le fond OSM), les sources sont recréées vides — d'où le
 * `styleEpoch` en dépendance et le report sur « idle » quand le style n'est
 * pas encore chargé.
 */
/**
 * Applique une mise à jour de source dès que le style est prêt, et rend de
 * quoi annuler l'attente.
 *
 * MapLibre ignore `setData` tant que le style n'est pas chargé, d'où le
 * report sur « idle ». Mais un `apply` laissé en attente ferme sur les
 * données de *son* rendu : si l'effet rejoue avant que la carte ne devienne
 * inactive, le vieil `apply` reprend la main et écrase le nouveau.
 *
 * C'est ainsi que le repère du profil altimétrique disparaissait : on
 * ouvrait la fiche (pas de repère, style pas encore chargé, `apply` mis en
 * attente), on cliquait le graphique (repère posé tout de suite, style
 * chargé entre-temps), puis la carte devenait inactive — et le rendu d'avant
 * le clic effaçait le repère.
 */
export function appliquerQuandPret(
  map: MaplibreMap,
  apply: () => void,
): (() => void) | undefined {
  if (map.isStyleLoaded()) {
    apply()
    return undefined
  }
  map.once('idle', apply)
  return () => {
    map.off('idle', apply)
  }
}

export function useMapSources(
  mapRef: RefObject<MaplibreMap | null>,
  ready: boolean,
  styleEpoch: number,
): void {
  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const customMatching = useAppStore((s) => s.customMatching)
  const tracks = useAppStore((s) => s.tracks)
  const pois = useAppStore((s) => s.pois)
  const userPosition = useAppStore((s) => s.userPosition)
  const elevationHover = useAppStore((s) => s.elevationHover)
  const drawPath = useAppStore((s) => s.drawPath)
  const drawWaypoints = useAppStore((s) => s.drawWaypoints)

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
    return appliquerQuandPret(map, apply)
  }, [
    mapRef,
    itineraries,
    customItineraries,
    matching,
    customMatching,
    tracks,
    pois,
    ready,
    styleEpoch,
  ])

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
    return appliquerQuandPret(map, apply)
  }, [mapRef, drawPath, drawWaypoints, ready, styleEpoch])

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
    return appliquerQuandPret(map, apply)
  }, [mapRef, userPosition, ready, styleEpoch])

  // Point survolé sur le profil altimétrique.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const apply = () => {
      void map.getSource<GeoJSONSource>('elevation-hover')?.setData({
        type: 'FeatureCollection',
        features: elevationHover
          ? [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: elevationHover.point },
                properties: {},
              },
            ]
          : [],
      })
    }
    return appliquerQuandPret(map, apply)
  }, [mapRef, elevationHover, ready, styleEpoch])

}
