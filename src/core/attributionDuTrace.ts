import { attributionDe, type GpxAttribution } from './gpxExport.ts'
import { nodeKey } from './routing.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * La provenance d'un tracé dessiné : celle des sentiers qu'il suit (#557).
 *
 * Le crayon ne dessine pas : il suit les chemins du graphe de routage, dont
 * chaque arête est un pas d'un `way` d'itinéraire. Le tracé enregistré copie
 * donc leur géométrie — OSM sous ODbL, une boucle de la Métropole ou un PDIPR
 * sous Licence Ouverte —, et toutes deux exigent l'attribution. Le tracé
 * s'exportait pourtant sans `<copyright>`, au nom d'un commentaire qui le
 * disait « sans source » (§4bis).
 *
 * Un sentier est crédité quand le tracé **emprunte** l'une de ses arêtes, pas
 * quand il le croise : toucher un GR en un point n'en copie rien. Les
 * arêtes se comparent par `nodeKey`, la clé même du graphe.
 *
 * ## Plusieurs sources
 *
 * Choix de présentation, tranché au jugement (§2) le 20/10 : un GPX ne porte
 * qu'un `<copyright>`, et `Itinerary.attribution` qu'une source. Plusieurs
 * sources suivies sont donc réunies en une : auteurs et licences séparés
 * par « ; » (`SEPARATEUR`), dans l'ordre où le tracé les rencontre — une
 * licence déclarée peut être un texte à espaces, « Licence Ouverte 2.0 ».
 * `sourcesDe` les sépare à nouveau pour qui crédite source par source.
 * Écarté : ne garder que la première, qui tairait les autres — la faute même
 * qu'on corrige. Écarté aussi : un tableau d'attributions sur l'itinéraire,
 * qui changerait le format rangé en base et dans les sauvegardes pour un cas
 * que le GPX ne saurait de toute façon pas écrire.
 */
export function attributionDuTrace(
  chemin: readonly LonLat[],
  itineraires: readonly Itinerary[],
): GpxAttribution | null {
  const pas = new Map<string, number>()
  for (let i = 1; i < chemin.length; i++) {
    const a = chemin[i - 1] as LonLat
    const b = chemin[i] as LonLat
    pas.set(arete(a, b), i)
    pas.set(arete(b, a), i)
  }

  const rencontrees: { rang: number; source: GpxAttribution }[] = []
  for (const itin of itineraires) {
    const source = attributionDe(itin)
    if (!source) continue
    let premier = Infinity
    for (const way of itin.ways) {
      for (let i = 1; i < way.coords.length; i++) {
        const rang = pas.get(
          arete(way.coords[i - 1] as LonLat, way.coords[i] as LonLat),
        )
        if (rang !== undefined && rang < premier) premier = rang
      }
    }
    if (premier !== Infinity) rencontrees.push({ rang: premier, source })
  }

  const sources: GpxAttribution[] = []
  // Source par source : un itinéraire importé peut porter des sources déjà
  // réunies, et les comparer en bloc répétait l'ODbL (revue du 20/10).
  for (const { source: reunie } of rencontrees.sort((x, y) => x.rang - y.rang)) {
    for (const source of sourcesDe(reunie)) {
      const deja = sources.some(
        (s) => s.author === source.author && s.license === source.license,
      )
      if (!deja) sources.push(source)
    }
  }
  if (sources.length === 0) return null
  if (sources.length === 1) return sources[0] ?? null
  return {
    author: sources.map((s) => s.author).join(SEPARATEUR),
    license: sources.map((s) => s.license).join(SEPARATEUR),
  }
}

const SEPARATEUR = ' ; '

/**
 * Les sources réunies par `attributionDuTrace`, séparées à nouveau — pour
 * l'image de partage, qui crédite chaque source sous sa propre formule.
 * Une attribution simple se rend telle quelle.
 */
export function sourcesDe(attribution: GpxAttribution): GpxAttribution[] {
  const auteurs = attribution.author.split(SEPARATEUR)
  const licences = attribution.license.split(SEPARATEUR)
  if (auteurs.length < 2 || auteurs.length !== licences.length) {
    return [attribution]
  }
  return auteurs.map((author, i) => ({ author, license: licences[i] ?? '' }))
}

function arete(a: LonLat, b: LonLat): string {
  return `${nodeKey(a[0], a[1])}>${nodeKey(b[0], b[1])}`
}
