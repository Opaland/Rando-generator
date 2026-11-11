import type { FeatureCollection, LineString } from 'geojson'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'

/**
 * Pose le réseau de fond PDIPR sur la carte, avec le crédit de son
 * Département (#668).
 *
 * ## Pourquoi recréer la source
 *
 * Le contrôle d'attribution de MapLibre relit l'`attribution` de chaque
 * source utilisée à chaque `styledata` : porté par la source `pdipr`, un
 * crédit suit la zone sans réécrire celui du fond de carte (dont l'API
 * publique ne permet pas non plus de changer l'attribution). Mais une source
 * GeoJSON ne laisse pas changer son attribution après sa création — d'où la
 * couche retirée, la source recréée, et la couche reposée **au même rang**,
 * sous les tracés (voir `pdipr-reseau` dans `style.ts`).
 *
 * Quand l'attribution n'a pas changé, ce n'est qu'un `setData`.
 */
export function poserLeReseauDeFond(
  map: MaplibreMap,
  reseau: FeatureCollection<LineString>,
  attribution: string | null,
): void {
  const source = map.getSource<GeoJSONSource>('pdipr')
  if (!source) return
  // Typée `string`, absente en vrai quand la source n'en a pas reçu.
  const actuelle = (source.attribution as string | undefined) ?? null
  if (actuelle === attribution) {
    void source.setData(reseau)
    return
  }
  const couches = map.getStyle().layers
  const rang = couches.findIndex((c) => c.id === 'pdipr-reseau')
  // `at(-1)` rendrait la dernière couche : une couche absente reste absente.
  const couche = rang >= 0 ? couches[rang] : undefined
  const suivante = rang >= 0 ? couches[rang + 1]?.id : undefined
  if (couche) map.removeLayer('pdipr-reseau')
  map.removeSource('pdipr')
  map.addSource('pdipr', {
    type: 'geojson',
    data: reseau,
    ...(attribution === null ? {} : { attribution }),
  })
  if (couche) map.addLayer(couche, suivante)
}
