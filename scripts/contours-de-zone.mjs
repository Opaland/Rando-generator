// Génère public/data/contours-de-zone.json : le contour simplifié de chaque
// limite OSM qu'interrogent les zones prédéfinies, pour retrouver une sortie
// par le lieu où elle a été faite (#296, décision de Cédric du 22/10 :
// « contours à ~100 m »).
//
// Même source et même contrôle que `emprises-de-zone.mjs` : chaque sélecteur
// de `ZONES` est relu (boundary, admin_level, name), cherché sur Nominatim, et
// une réponse qui ne porte pas le même type de limite ou le même niveau
// administratif arrête le script plutôt que d'écrire le contour d'un homonyme.
//
// Le seuil de simplification est celui de Nominatim (`polygon_threshold`,
// en degrés) : 0,001°, soit ~100 m. Il change ce qui est calculé — une trace
// qui longe une limite à moins de ~100 m peut tomber du mauvais côté — et
// c'est pourquoi il a été tranché par Cédric, pas ici (§2).
//
// Le fichier est indexé par sélecteur, et non par zone : une zone composite
// (« Rhône, Loire et Pilat ») réutilise les contours de ses parties, et le nom
// d'une zone se lit dans `ZONES` au lieu d'être recopié ici (§4ter).
//
// Usage : node --experimental-strip-types scripts/contours-de-zone.mjs
// (une requête par seconde, comme le demande la politique de Nominatim).

import { writeFileSync } from 'node:fs'
import { ZONES } from '../src/core/overpass.ts'

export const SEUIL_DEGRES = 0.001
const SORTIE = new URL('../public/data/contours-de-zone.json', import.meta.url)
const AGENT = 'Sentiers/1.0 (generation des contours de zone)'

function lireSelecteur(selecteur) {
  const tags = Object.fromEntries(
    [...selecteur.matchAll(/\["([^"]+)"="([^"]+)"\]/g)].map((m) => [m[1], m[2]]),
  )
  if (!tags.boundary || !tags.name) {
    throw new Error(`Sélecteur illisible : ${selecteur}`)
  }
  return tags
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

// 1e-4 degré (~10 m) : dix fois plus fin que le seuil, il ne déplace aucun
// sommet de façon visible et divise le poids du fichier.
const arrondir = (x) => Math.round(x * 1e4) / 1e4

/** Les polygones d'une géométrie GeoJSON, en `[anneaux][points][lon, lat]`. */
function polygonesDe(geometrie) {
  if (geometrie.type === 'Polygon') return [geometrie.coordinates]
  if (geometrie.type === 'MultiPolygon') return geometrie.coordinates
  throw new Error(`Géométrie inattendue : ${geometrie.type}`)
}

async function contour(selecteur) {
  const tags = lireSelecteur(selecteur)
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', tags.name)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('extratags', '1')
  url.searchParams.set('limit', '20')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('polygon_threshold', String(SEUIL_DEGRES))
  const reponse = await fetch(url, { headers: { 'User-Agent': AGENT } })
  if (!reponse.ok) throw new Error(`${tags.name} : HTTP ${String(reponse.status)}`)
  const resultats = await reponse.json()
  const retenu = resultats.find(
    (r) =>
      r.osm_type === 'relation' &&
      r.category === 'boundary' &&
      r.type === tags.boundary &&
      r.name === tags.name &&
      (tags.admin_level === undefined ||
        r.extratags?.admin_level === tags.admin_level),
  )
  if (!retenu) throw new Error(`Aucune relation conforme pour ${selecteur}`)
  const polygones = polygonesDe(retenu.geojson).map((anneaux) =>
    anneaux.map((anneau) => anneau.map(([lon, lat]) => [arrondir(lon), arrondir(lat)])),
  )
  return { relation: retenu.osm_id, polygones }
}

const contours = {}
for (const selecteur of new Set(ZONES.flatMap((z) => z.areaSelectors))) {
  contours[selecteur] = await contour(selecteur)
  await attendre(1_100)
}

const jour = new Date().toISOString().slice(0, 10)
writeFileSync(
  SORTIE,
  JSON.stringify({
    source: `Limites OpenStreetMap via Nominatim, simplifiées à ${String(SEUIL_DEGRES)}°, le ${jour} — © les contributeurs d'OpenStreetMap, ODbL. Généré par scripts/contours-de-zone.mjs.`,
    seuilDegres: SEUIL_DEGRES,
    contours,
  }),
)
const sommets = Object.values(contours)
  .flatMap((c) => c.polygones.flat())
  .reduce((n, anneau) => n + anneau.length, 0)
console.log(
  `${String(Object.keys(contours).length)} contours, ${String(sommets)} sommets, écrits dans ${SORTIE.pathname}`,
)
