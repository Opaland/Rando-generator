/**
 * Ce qu'OpenStreetMap sait vraiment des commerces de village (issue #285).
 *
 * ## Pourquoi ce script existe plutôt qu'une fonctionnalité
 *
 * L'issue #285 demande d'afficher ravitaillement, dodo et mairie le long
 * d'un tracé — et elle pose elle-même sa condition :
 *
 * > **mesurer la couverture avant de promettre la fonctionnalité.** Sur un
 * > échantillon de villages de moyenne montagne, quelle part des commerces
 * > porte `opening_hours` ? quelle part porte `phone` ? Si c'est 15 %, la
 * > fonctionnalité est un formulaire vide et il vaut mieux le savoir avant.
 *
 * Cette mesure n'a jamais été prise, pour une raison bête : le proxy sortant
 * de l'environnement de développement refuse `overpass-api.de`. Elle est donc
 * restée « à faire » dans une issue, c'est-à-dire nulle part.
 *
 * Ce script la prend. Il tourne partout où Overpass est joignable — une
 * machine ordinaire suffit — et rend les chiffres qui manquent pour décider.
 *
 * ```
 * node scripts/couverture-village.mjs
 * node scripts/couverture-village.mjs --villages "Bourg-d'Oisans,Le Bourg-d'Arud"
 * ```
 *
 * ## Ce qu'il mesure, et ce qu'il ne mesure pas
 *
 * Il compte, par catégorie, la part de points qui portent `opening_hours`,
 * `phone` et `website`, et **l'âge médian du relevé**. Ce dernier chiffre
 * est le plus important des trois : un `opening_hours` présent sur 80 % des
 * commerces mais relevé il y a six ans ne vaut pas mieux qu'un champ vide,
 * et c'est précisément ce que la fermeture saisonnière rend faux.
 *
 * Il ne dit pas si un commerce est ouvert. Rien ne le dit.
 */
import { argv } from 'node:process'

/**
 * Villages de moyenne montagne traversés par des GR, choisis pour varier
 * les massifs et les tailles — pas pour flatter le résultat.
 *
 * Ce ne sont pas des données de production : c'est l'échantillon d'une
 * mesure, et il est écrit ici pour qu'on puisse discuter de sa
 * représentativité plutôt que de la deviner.
 */
const VILLAGES_PAR_DEFAUT = [
  'Le Bourg-d’Oisans', // Oisans, GR 54
  'Chalmazel', // Forez, GR 3
  'Saint-Julien-Molin-Molette', // Pilat, GR 65
  'Munster', // Vosges, GR 5
  'Barèges', // Pyrénées, GR 10
  'Le Monêtier-les-Bains', // Écrins, GR 50
  'Saint-Rémy-de-Provence', // Alpilles, GR 6
  'Chaudes-Aigues', // Aubrac, GR 65
]

const CATEGORIES = {
  ravitaillement: '"shop"~"^(convenience|supermarket|bakery|butcher|greengrocer)$"',
  dodo: '"tourism"~"^(hotel|guest_house|chalet|camp_site|apartment|hostel)$"',
  mairie: '"amenity"="townhall"',
  depannage: '"amenity"~"^(pharmacy|post_office|fuel)$"',
  manger: '"amenity"~"^(restaurant|cafe|bar)$"',
}

const MIROIRS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

function requete(village) {
  const clauses = Object.values(CATEGORIES)
    .map((filtre) => `  nwr[${filtre}](area.v);`)
    .join('\n')
  return `[out:json][timeout:120];
area["name"="${village.replace(/"/g, '\\"')}"]["boundary"="administrative"]->.v;
(
${clauses}
);
out meta center 500;`
}

async function interroger(village) {
  let derniere
  for (const miroir of MIROIRS) {
    try {
      const reponse = await fetch(miroir, {
        method: 'POST',
        body: `data=${encodeURIComponent(requete(village))}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (!reponse.ok) throw new Error(`HTTP ${String(reponse.status)}`)
      const data = await reponse.json()
      /*
        Overpass signale ses échecs en HTTP 200, avec un corps bien formé et
        la raison dans `remark` (issue #283). Sans cette lecture, un
        dépassement de délai se lirait comme « ce village n'a aucun commerce »
        — et la mesure conclurait à une couverture de zéro pour cent.
      */
      if (data.remark) throw new Error(`remark : ${data.remark}`)
      return data.elements ?? []
    } catch (erreur) {
      derniere = erreur
    }
  }
  throw derniere ?? new Error('aucun miroir joignable')
}

function categorieDe(tags) {
  if (tags.shop) return 'ravitaillement'
  if (tags.tourism) return 'dodo'
  if (tags.amenity === 'townhall') return 'mairie'
  if (['pharmacy', 'post_office', 'fuel'].includes(tags.amenity ?? ''))
    return 'depannage'
  if (['restaurant', 'cafe', 'bar'].includes(tags.amenity ?? '')) return 'manger'
  return null
}

const pourcent = (part, total) =>
  total === 0 ? '—' : `${String(Math.round((100 * part) / total))} %`

function medianeAns(horodatages, maintenant) {
  if (horodatages.length === 0) return '—'
  const ans = horodatages
    .map((t) => (maintenant - Date.parse(t)) / (365.25 * 24 * 3600 * 1000))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (ans.length === 0) return '—'
  const milieu = ans[Math.floor(ans.length / 2)]
  return `${milieu.toFixed(1)} ans`
}

const arg = argv.indexOf('--villages')
const villages =
  arg >= 0 && argv[arg + 1]
    ? argv[arg + 1].split(',').map((v) => v.trim())
    : VILLAGES_PAR_DEFAUT

const compte = {}
for (const nom of Object.keys(CATEGORIES)) {
  compte[nom] = { total: 0, horaires: 0, phone: 0, site: 0, dates: [] }
}
const echecs = []
const maintenant = Date.now()

for (const village of villages) {
  process.stderr.write(`… ${village}\n`)
  let elements
  try {
    elements = await interroger(village)
  } catch (erreur) {
    echecs.push(`${village} : ${erreur.message}`)
    continue
  }
  for (const el of elements) {
    const tags = el.tags ?? {}
    const cat = categorieDe(tags)
    if (!cat) continue
    const c = compte[cat]
    c.total += 1
    if (tags.opening_hours) c.horaires += 1
    if (tags.phone || tags['contact:phone']) c.phone += 1
    if (tags.website || tags['contact:website']) c.site += 1
    if (el.timestamp) c.dates.push(el.timestamp)
  }
}

console.log(`\n# Couverture OSM des commerces de village (issue #285)\n`)
console.log(
  `${String(villages.length - echecs.length)} village(s) mesuré(s) sur ${String(villages.length)}.\n`,
)
console.log(
  '| catégorie | points | `opening_hours` | `phone` | `website` | âge médian du relevé |',
)
console.log('|---|---:|---:|---:|---:|---:|')
for (const [nom, c] of Object.entries(compte)) {
  console.log(
    `| ${nom} | ${String(c.total)} | ${pourcent(c.horaires, c.total)} | ` +
      `${pourcent(c.phone, c.total)} | ${pourcent(c.site, c.total)} | ` +
      `${medianeAns(c.dates, maintenant)} |`,
  )
}

if (echecs.length > 0) {
  console.log(`\n## Villages non mesurés\n`)
  for (const e of echecs) console.log(`- ${e}`)
  console.log(
    `\nUn village manquant n'est pas une couverture nulle : les chiffres ` +
      `ci-dessus ne portent que sur ce qui a répondu.`,
  )
}

console.log(
  `\n**L'âge médian est le chiffre qui décide.** Un \`opening_hours\` présent ` +
    `sur 80 % des commerces mais relevé il y a six ans ne vaut pas mieux ` +
    `qu'un champ vide : en moyenne montagne, la fermeture saisonnière est la ` +
    `règle et n'apparaît presque jamais dans le tag.`,
)
