import { useEffect, type RefObject } from 'react'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import {
  buildDeclaresGeoJSON,
  buildTrailGeoJSON,
  buildTracksGeoJSON,
} from '../../core/mapdata.ts'
import { traceProvisoire } from '../../core/sortieEnCours.ts'
import { useAppStore } from '../../store/appStore.ts'
import { poisToGeoJSON, revetementToGeoJSON } from './style.ts'

/**
 * Pousse les données de l'application dans les sources GeoJSON de la carte.
 *
 * Toutes ces mises à jour partagent la même précaution : après un setStyle
 * (repli sur le fond OSM), les sources sont recréées vides — d'où le
 * `styleEpoch` en dépendance et le report sur « idle » quand le style n'est
 * pas encore chargé.
 */
/**
 * Applique une mise à jour dès que les sources qu'elle écrit existent, et
 * rend de quoi annuler l'attente.
 *
 * `setData` est sans effet sur une source absente — et l'appel passe par un
 * `?.`, donc en silence. Il faut donc bien attendre quelque chose. Mais
 * attendre *quoi* a coûté deux corrections.
 *
 * Un `apply` laissé en attente ferme sur les données de *son* rendu : si
 * l'effet rejoue avant que l'attente se lève, le vieil `apply` reprend la
 * main et écrase le nouveau. C'est ainsi que le repère du profil
 * altimétrique disparaissait (#186), d'où le nettoyage rendu par cette
 * fonction — que l'appelant doit rendre à React.
 *
 * L'attente elle-même portait sur `isStyleLoaded()`, puis sur « idle ».
 * Or les deux exigent, dans MapLibre, que **toutes** les sources de la
 * carte soient chargées — le fond raster compris, qui n'a rien à voir avec
 * les sources GeoJSON écrites ici. Quand le fond boucle en erreur (les e2e
 * avortent toutes les requêtes de tuiles ; un utilisateur hors ligne est
 * dans le même cas), « idle » peut ne jamais venir : la mise à jour restait
 * en attente pour toujours, et le repère n'arrivait jamais. Mesuré : aucun
 * « idle » en cinq secondes sur les runs en échec, plusieurs dizaines sur
 * ceux qui passaient.
 *
 * La condition porte donc sur ce qu'on veut réellement savoir — la source
 * visée existe-t-elle — et le réveil sur « styledata », qui se déclenche à
 * chaque changement du style sans dépendre du chargement des tuiles.
 */
export function appliquerQuandPret(
  map: MaplibreMap,
  sources: readonly string[],
  apply: () => void,
): (() => void) | undefined {
  const pretes = () => sources.every((id) => map.getSource(id) !== undefined)
  if (pretes()) {
    apply()
    return undefined
  }
  const reessayer = () => {
    // « styledata » se déclenche plusieurs fois pendant la mise en place du
    // style : on ne se désabonne que lorsqu'on a vraiment appliqué.
    if (!pretes()) return
    map.off('styledata', reessayer)
    apply()
  }
  map.on('styledata', reessayer)
  return () => {
    map.off('styledata', reessayer)
  }
}

/**
 * Les sources écrites par chaque effet. Nommées plutôt que recopiées : une
 * liste en désaccord avec les `setData` qui suivent produirait soit une
 * attente inutile, soit une écriture silencieusement perdue.
 */
const SOURCES_DONNEES = [
  'trails',
  'trails-done',
  'trails-declares',
  'trails-revetement',
  'tracks',
  'pois',
] as const
const SOURCES_DESSIN = ['draw', 'draw-points'] as const
const SOURCES_POSITION = ['user-position'] as const
const SOURCES_REPERE = ['elevation-hover'] as const

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
  const enregistrement = useAppStore((s) => s.enregistrement)
  const pois = useAppStore((s) => s.pois)
  const userPosition = useAppStore((s) => s.userPosition)
  const elevationHover = useAppStore((s) => s.elevationHover)
  const drawPath = useAppStore((s) => s.drawPath)
  const parcoursDeclares = useAppStore((s) => s.parcoursDeclares)
  const drawWaypoints = useAppStore((s) => s.drawWaypoints)
  const detailItineraryId = useAppStore((s) => s.detailItineraryId)

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
      // Le déclaratif (issue #158) : sa propre source, et rien de commun avec
      // les échantillons du matching.
      const declares = buildDeclaresGeoJSON(
        [...itineraries, ...customItineraries],
        parcoursDeclares,
      )
      void map.getSource<GeoJSONSource>('trails-declares')?.setData(declares)

      /*
        Le terrain, seulement pour l'itinéraire qu'on regarde.

        Peindre le revêtement de tous les itinéraires de la zone couvrirait
        la carte de bandes parallèles et rendrait le balisage illisible — on
        aurait échangé une information contre du bruit. La bande accompagne
        donc la fiche ouverte, comme le profil altimétrique qu'elle prolonge.

        Sans fiche ouverte, la source est vidée plutôt que laissée en place :
        une couche qui garde ses données après la fermeture peint le terrain
        d'un itinéraire qu'on ne regarde plus.
      */
      const regarde = [...itineraries, ...customItineraries].filter(
        (i) => i.osmRelationId === detailItineraryId,
      )
      void map
        .getSource<GeoJSONSource>('trails-revetement')
        ?.setData(revetementToGeoJSON(regarde))
      // La sortie en cours passe par la même source que les traces
      // importées : une seule couche, un seul style. Sans elle, on marche
      // deux heures en regardant une carte vide.
      const provisoire = traceProvisoire(enregistrement)
      const tracesDessinees = buildTracksGeoJSON(
        provisoire ? [...tracks, provisoire] : tracks,
      )
      void map.getSource<GeoJSONSource>('tracks')?.setData(tracesDessinees)
      void map.getSource<GeoJSONSource>('pois')?.setData(poisToGeoJSON(pois))
      // Témoin pour les tests e2e : quelles données ont été appliquées, et
      // sur quelle génération de style (permet de vérifier la ré-application
      // après le repli de fond de carte).
      ;(
        window as {
          __sentiersTrailStats?: {
            base: number
            done: number
            traces: number
            declares: number
            styleEpoch: number
          }
        }
      ).__sentiersTrailStats = {
        base: base.features.length,
        done: done.features.length,
        // La source `tracks` porte les traces importées **et** la sortie en
        // cours : c'est le seul moyen, sans WebGL, de vérifier qu'on la
        // dessine pendant qu'on la marche.
        traces: tracesDessinees.features.length,
        // Le déclaratif ne se lit pas au pixel : sans ce témoin, aucun test
        // ne peut dire s'il est dessiné (issue #158).
        declares: declares.features.length,
        styleEpoch,
      }
    }
    // Après un setStyle (repli OSM), les sources se rechargent : on ré-applique.
    return appliquerQuandPret(map, SOURCES_DONNEES, apply)
  }, [
    mapRef,
    itineraries,
    customItineraries,
    parcoursDeclares,
    detailItineraryId,
    matching,
    customMatching,
    tracks,
    enregistrement,
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
    return appliquerQuandPret(map, SOURCES_DESSIN, apply)
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
    return appliquerQuandPret(map, SOURCES_POSITION, apply)
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
    return appliquerQuandPret(map, SOURCES_REPERE, apply)
  }, [mapRef, elevationHover, ready, styleEpoch])

}
