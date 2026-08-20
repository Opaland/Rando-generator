import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  Map as MaplibreMap,
  NavigationControl,
  type ErrorEvent as MapErrorEvent,
} from 'maplibre-gl'
import {
  ATTRIBUTION,
  ATTRIBUTION_OSM,
  IGN_TILES,
  OSM_TILES,
  baseStyle,
} from './style.ts'

/** Nombre d'erreurs de tuiles avant de basculer sur le fond OpenStreetMap. */
const ERREURS_AVANT_REPLI = 3

export interface MapInstance {
  mapRef: RefObject<MaplibreMap | null>
  /** Vrai une fois le premier style chargé : les couches existent. */
  ready: boolean
  /**
   * Incrémenté à chaque `style.load` (repli OSM). Les sources recréées par
   * `setStyle` repartent vides : les effets de données doivent se rejouer.
   */
  styleEpoch: number
  /** WebGL indisponible : l'application reste utilisable, sans carte. */
  mapError: boolean
}

/**
 * Crée la carte, une seule fois, et gère le repli du fond de plan.
 *
 * Sorti de MapView (issue #9), où la création, le repli de tuiles, les
 * interactions et la sélection tenaient dans un même effet de cent vingt
 * lignes — impossible à lire d'un trait, et impossible à modifier sans
 * relire le tout.
 */
export function useMapInstance(
  containerRef: RefObject<HTMLDivElement | null>,
): MapInstance {
  const mapRef = useRef<MaplibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const [styleEpoch, setStyleEpoch] = useState(0)
  const [mapError, setMapError] = useState(false)
  const repliFait = useRef(false)
  const erreursTuiles = useRef(0)

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
      if (sourceId !== 'basemap' || repliFait.current) return
      erreursTuiles.current += 1
      if (erreursTuiles.current >= ERREURS_AVANT_REPLI) {
        repliFait.current = true
        map.setStyle(baseStyle(OSM_TILES, ATTRIBUTION_OSM))
      }
    })

    return () => {
      delete (window as { __sentiersMap?: MaplibreMap }).__sentiersMap
      map.remove()
      mapRef.current = null
    }
  }, [containerRef])

  return { mapRef, ready, styleEpoch, mapError }
}
