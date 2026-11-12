import type { FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'

/**
 * Pose des données sur une source GeoJSON de la carte, avec le crédit de
 * leur producteur (#668 pour le PDIPR, #676 pour les boucles de la
 * Métropole et le GR Nord).
 *
 * ## Pourquoi recréer la source
 *
 * Le contrôle d'attribution de MapLibre relit l'`attribution` de chaque
 * source **utilisée** — c'est-à-dire qu'une couche visible lit — à chaque
 * `styledata` : porté par la source qui peint les données, un crédit suit
 * ce qui est peint sans réécrire celui du fond de carte (dont l'API publique
 * ne permet pas non plus de changer l'attribution). Mais une source GeoJSON
 * ne laisse pas changer son attribution après sa création — d'où les
 * couches retirées, la source recréée, et les couches reposées **au même
 * rang** : `trails` en a plusieurs, et l'ordre des couches est l'ordre de
 * peinture.
 *
 * Quand l'attribution n'a pas changé, ce n'est qu'un `setData` : le cas de
 * presque chaque appel.
 */
export function poserUneSourceCreditee(
  map: MaplibreMap,
  id: string,
  donnees: FeatureCollection,
  attribution: string | null,
): void {
  const source = map.getSource<GeoJSONSource>(id)
  if (!source) return
  // Typée `string`, absente en vrai quand la source n'en a pas reçu.
  const actuelle = (source.attribution as string | undefined) ?? null
  if (actuelle === attribution) {
    void source.setData(donnees)
    return
  }
  const couches = map.getStyle().layers
  const siennes = couches.flatMap((couche, rang) => {
    if (!('source' in couche) || couche.source !== id) return []
    // Le repère est la première couche suivante qui **reste** : une couche
    // de la même source sera retirée, on ne peut pas se poser devant elle.
    const repere = couches.slice(rang + 1).find((c) => !('source' in c) || c.source !== id)
    return [{ couche, avant: repere?.id }]
  })
  for (const { couche } of siennes) map.removeLayer(couche.id)
  map.removeSource(id)
  map.addSource(id, {
    type: 'geojson',
    data: donnees,
    ...(attribution === null ? {} : { attribution }),
  })
  // Dans l'ordre d'origine, chacune devant le même repère : l'ordre relatif
  // des couches de la source se reconstitue.
  for (const { couche, avant } of siennes) map.addLayer(couche, avant)
}
