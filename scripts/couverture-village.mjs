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
 * node scripts/couverture-village.mjs --villages "Chamonix:110788"
 * ```
 *
 * `--villages` prend des paires `Nom:identifiant`, l'identifiant étant une
 * relation OSM (trouvée sur nominatim.openstreetmap.org/search?q=<nom>) —
 * jamais un nom seul : voir pourquoi sous `VILLAGES_PAR_DEFAUT`.
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
 *
 * ## Ce que la mesure du 07/09 a rendu
 *
 * `opening_hours` : 62–100 % sur ravitaillement/mairie/dépannage, 8 % sur le
 * dodo (attendu : ce tag décrit un horaire d'ouverture, pas une disponibilité
 * de lit). Âge médian du relevé : 0,5 à 1,8 an partout, jamais les six ans
 * redoutés. Détail et chiffres complets : `docs/MESURE_VILLAGE_07_09.md`.
 */
import { argv } from 'node:process'

/**
 * Villages de moyenne montagne traversés par des GR, choisis pour varier
 * les massifs et les tailles — pas pour flatter le résultat.
 *
 * Ce ne sont pas des données de production : c'est l'échantillon d'une
 * mesure, et il est écrit ici pour qu'on puisse discuter de sa
 * représentativité plutôt que de la deviner.
 *
 * ## Pourquoi un identifiant de relation, et pas seulement un nom
 *
 * La première exécution (07/09) interrogeait `area["name"="Munster"]` sans
 * autre filtre : Overpass unit **toutes** les zones administratives qui
 * portent ce nom avant d'y chercher des commerces. Il en existe sept dans le
 * monde — dont un `admin_level=5` (une province) — et la mesure comptait
 * donc leurs commerces additionnés, pas ceux du seul village vosgien visé.
 * C'est le §1bis appliqué à un nom de lieu plutôt qu'à une bbox : une zone
 * non vérifiée rend un résultat indiscernable d'une zone correcte tant qu'on
 * ne l'a pas nommée par son identifiant.
 *
 * Chaque identifiant est une relation OSM, résolue par Nominatim le 07/09
 * (`nominatim.openstreetmap.org/search?q=<village>, France`) puis vérifiée
 * une à une : Munster en portait deux (Moselle et Haut-Rhin), c'est le
 * second qui longe le GR 5.
 */
const VILLAGES_PAR_DEFAUT = [
  { nom: 'Le Bourg-d’Oisans', id: 1_347_500 }, // Oisans, GR 54
  { nom: 'Chalmazel', id: 1_043_076 }, // Forez, GR 3
  { nom: 'Saint-Julien-Molin-Molette', id: 445_336 }, // Pilat, GR 65
  { nom: 'Munster (Haut-Rhin)', id: 905_906 }, // Vosges, GR 5
  { nom: 'Barèges', id: 2_327_992 }, // Pyrénées, GR 10
  { nom: 'Le Monêtier-les-Bains', id: 972_052 }, // Écrins, GR 50
  { nom: 'Saint-Rémy-de-Provence', id: 103_755 }, // Alpilles, GR 6
  { nom: 'Chaudes-Aigues', id: 2_658_224 }, // Aubrac, GR 65
]

const CATEGORIES = {
  ravitaillement: '"shop"~"^(convenience|supermarket|bakery|butcher|greengrocer)$"',
  dodo: '"tourism"~"^(hotel|guest_house|chalet|camp_site|apartment|hostel)$"',
  mairie: '"amenity"="townhall"',
  depannage: '"amenity"~"^(pharmacy|post_office|fuel)$"',
  manger: '"amenity"~"^(restaurant|cafe|bar)$"',
}

/**
 * `maps.mail.ru` en tête : les deux miroirs de l'application coupaient la
 * connexion depuis cet environnement (mesuré le 27/08, voir
 * `tests/unit/mesuresReseau.test.ts`), pas ce troisième. Vérifié par un
 * témoin avant la première exécution réelle (07/09) : une requête sur
 * Munster y rend de vrais commerces, pas une réponse vide de miroir.
 */
const MIROIRS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/**
 * Le délai de courtoisie entre deux villages (issue #285, mesure du 07/09).
 *
 * Chaque village est une requête `area[name=...]` suivie de cinq filtres
 * `nwr` : plus léger qu'un département, mais huit villages coup sur coup
 * ont le même effet que deux Overpass lourds en #331 — le miroir coupe.
 */
const REPOS_ENTRE_VILLAGES_MS = 5_000

function patienter(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requete(id) {
  const clauses = Object.values(CATEGORIES)
    .map((filtre) => `  nwr[${filtre}](area.v);`)
    .join('\n')
  // 3600000000 + id : la conversion documentée d'un identifiant de relation
  // OSM en identifiant d'aire Overpass — pas une zone nommée, qu'Overpass
  // unirait avec toute autre zone administrative portant le même nom.
  return `[out:json][timeout:120];
area(${String(3_600_000_000 + id)})->.v;
(
${clauses}
);
out meta center 500;`
}

/**
 * Le rattrapage d'un 429, mesuré le 07/09 : malgré les cinq secondes entre
 * villages, un miroir sur huit répond « trop de requêtes » à chaque
 * exécution — jamais le même. Ce n'est pas un échec à consigner, c'est le
 * tarif du service public le jour où on le sollicite ; il se rattrape comme
 * `REPOS_APRES_429_MS` le fait déjà pour l'API OSM dans #331.
 */
const REPOS_APRES_429_MS = 20_000
const ESSAIS_PAR_MIROIR = 2

async function interroger(village) {
  let derniere
  for (const miroir of MIROIRS) {
    for (let essai = 1; essai <= ESSAIS_PAR_MIROIR; essai += 1) {
      try {
        const reponse = await fetch(miroir, {
          method: 'POST',
          body: `data=${encodeURIComponent(requete(village.id))}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        if (reponse.status === 429) {
          derniere = new Error('HTTP 429')
          if (essai < ESSAIS_PAR_MIROIR) await patienter(REPOS_APRES_429_MS)
          continue
        }
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
        break
      }
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

/*
  Un nom seul ne suffit pas à désigner une zone administrative — Munster en
  porte deux rien qu'en France, et sept dans le monde (voir le commentaire de
  VILLAGES_PAR_DEFAUT). L'option prend donc des paires « Nom:identifiant »,
  l'identifiant se trouvant via nominatim.openstreetmap.org/search?q=<nom>.
*/
const arg = argv.indexOf('--villages')
const villages =
  arg >= 0 && argv[arg + 1]
    ? argv[arg + 1].split(',').map((entree) => {
        const [nom, id] = entree.split(':').map((v) => v.trim())
        return { nom, id: Number(id) }
      })
    : VILLAGES_PAR_DEFAUT

const compte = {}
for (const nom of Object.keys(CATEGORIES)) {
  compte[nom] = { total: 0, horaires: 0, phone: 0, site: 0, dates: [] }
}
const echecs = []
const maintenant = Date.now()

let premier = true
for (const village of villages) {
  if (!premier) await patienter(REPOS_ENTRE_VILLAGES_MS)
  premier = false
  process.stderr.write(`… ${village.nom}\n`)
  let elements
  try {
    elements = await interroger(village)
  } catch (erreur) {
    echecs.push(`${village.nom} : ${erreur.message}`)
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

if (argv.includes('--json')) {
  console.log(
    JSON.stringify({
      mesures: Object.fromEntries(
        Object.entries(compte).map(([nom, c]) => [
          nom,
          { total: c.total, horaires: c.horaires, phone: c.phone, site: c.site, dates: c.dates },
        ]),
      ),
      echecs,
    }),
  )
  process.exit(0)
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
