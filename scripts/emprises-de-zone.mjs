// Génère src/core/emprisesDeZone.donnees.ts : l'emprise administrative de
// chaque zone prédéfinie, sur laquelle la carte cadre quand on la choisit
// (#578, décision de Cédric du 22/10).
//
// Les emprises viennent des mêmes relations OSM que celles qu'interrogent
// les sélecteurs de `ZONES` : chaque sélecteur est relu (boundary,
// admin_level, name) et cherché sur Nominatim, qui rend la boîte englobante
// de la relation. Une réponse qui ne porte pas le même type de limite, ou pas
// le même niveau administratif, est refusée : le script s'arrête plutôt que
// d'écrire l'emprise d'un homonyme.
//
// Nominatim et non Overpass : les deux miroirs de l'application étaient
// saturés le 22/10, et Nominatim rend la même boîte, celle de la relation.
//
// Usage : node --experimental-strip-types scripts/emprises-de-zone.mjs
// (une requête par seconde, comme le demande la politique de Nominatim).

import { writeFileSync } from 'node:fs'
import { ZONES } from '../src/core/overpass.ts'

// Zones laissées sans emprise, donc cadrées sur leurs itinéraires — tranché
// au jugement le 22/10 (§2 : seuil de présentation, écrit ici).
//
// La limite de la Nouvelle-Calédonie (relation 3407643) englobe les
// Chesterfield à l'ouest et Matthew–Hunter à l'est : 1 600 km de diagonale,
// où la Grande Terre ne serait qu'un point. Ses itinéraires, eux, sont une
// quinzaine (mesuré le 07/09, voir `NOUVELLE_CALEDONIE_SELECTORS`), sans
// grande traversée qui déborde la collectivité : les cadrer ne reproduit pas
// le défaut de #578. Piste écartée : une boîte de la Grande Terre écrite à la
// main — elle ne viendrait d'aucune limite OSM et vieillirait sans le dire.
const SANS_EMPRISE = new Set(['nouvelle-caledonie'])

const SORTIE = new URL('../src/core/emprisesDeZone.donnees.ts', import.meta.url)
const AGENT = 'Sentiers/1.0 (generation des emprises de zone)'

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

async function emprise(selecteur) {
  const tags = lireSelecteur(selecteur)
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', tags.name)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('extratags', '1')
  url.searchParams.set('limit', '20')
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
  const [sud, nord, ouest, est] = retenu.boundingbox.map(Number)
  return { relation: retenu.osm_id, emprise: [ouest, sud, est, nord] }
}

const zones = ZONES.filter((z) => !SANS_EMPRISE.has(z.id))
const parSelecteur = new Map()
for (const selecteur of new Set(zones.flatMap((z) => z.areaSelectors))) {
  parSelecteur.set(selecteur, await emprise(selecteur))
  await attendre(1_100)
}

const arrondir = (x) => Math.round(x * 1e4) / 1e4
const lignes = zones.map((zone) => {
  const parts = zone.areaSelectors.map((s) => parSelecteur.get(s))
  const [ouest, sud, est, nord] = [
    Math.min(...parts.map((p) => p.emprise[0])),
    Math.min(...parts.map((p) => p.emprise[1])),
    Math.max(...parts.map((p) => p.emprise[2])),
    Math.max(...parts.map((p) => p.emprise[3])),
  ].map(arrondir)
  const relations = parts.map((p) => String(p.relation)).join(', ')
  return `  // relation${parts.length > 1 ? 's' : ''} ${relations}\n  '${zone.id}': [${String(ouest)}, ${String(sud)}, ${String(est)}, ${String(nord)}],`
})

const jour = new Date().toISOString().slice(0, 10)
writeFileSync(
  SORTIE,
  `// Fichier généré par scripts/emprises-de-zone.mjs le ${jour} — ne pas
// éditer à la main. Boîtes englobantes des limites OSM de chaque zone
// prédéfinie — hors celles que le script laisse sans emprise, et dit pourquoi —
// en [ouest, sud, est, nord], arrondies à 1e-4 degré (~10 m).
// © les contributeurs d'OpenStreetMap, ODbL.

import type { Emprise } from './emprisesDeZone.ts'

export const EMPRISES_DE_ZONE: Readonly<Record<string, Emprise>> = {
${lignes.join('\n')}
}
`,
)
console.log(`${String(zones.length)} emprises écrites dans ${SORTIE.pathname}`)
