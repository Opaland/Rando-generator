/**
 * Un commentaire qui nomme un fichier affirme qu'il existe.
 *
 * ## Le raté, daté
 *
 * `ItineraryList.tsx` a porté pendant plusieurs jours cette phrase :
 *
 * > `tests/unit/reseauxFiltrables.test.ts` garde cette liste : TypeScript ne
 * > voit rien passer quand un réseau s'ajoute au type sans s'ajouter ici.
 *
 * Ce fichier n'a jamais existé. Le diagnostic était juste, le remède
 * imaginaire, et la liste n'était gardée par rien pendant que le code
 * annonçait le contraire. C'est le §4bis dans sa forme la plus dure : les
 * trois commentaires faux qu'il raconte étaient au moins vrais quand ils ont
 * été écrits ; celui-là ne l'a jamais été.
 *
 * Dans la nuit du 27 au 28/08, trois justifications se sont encore révélées
 * fausses — l'emprise du modèle de terrain de l'IGN, « le conteneur ne peut
 * pas », « `SENTIERS_URL` n'est posée que par le déploiement ». Aucune de
 * ces trois n'était mécanisable. **Celle-ci l'est** : un chemin s'ouvre.
 *
 * ## Ce qu'il vérifie, et rien d'autre
 *
 * Tout chemin de dépôt cité entre accents graves — racine connue, extension
 * connue — existe. C'est l'**existence**, jamais la justesse de la phrase :
 * celle-là se relit, et le §2 interdit de prétendre mesurer ce qui se décide.
 *
 * Les motifs (`src/core/*.ts`) sont ignorés : ils désignent un ensemble, pas
 * un fichier.
 *
 * ## Les exceptions, et pourquoi elles ne peuvent pas pourrir
 *
 * Certains commentaires citent un fichier **précisément parce qu'il n'existe
 * pas** — le raté ci-dessus est raconté en le nommant. Une liste d'exceptions
 * est donc nécessaire, et c'est là qu'un garde-fou devient un bandeau sur les
 * yeux.
 *
 * D'où la seconde moitié de la règle : **une exception dont le fichier
 * apparaît fait échouer le script**. Le jour où quelqu'un crée
 * `reseauxFiltrables.test.ts`, l'exception cesse d'avoir un sens et le dit,
 * au lieu de masquer en silence la seule chose qu'elle devait laisser passer.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RACINES = [
  'src/',
  'tests/',
  'scripts/',
  'docs/',
  'public/',
  'deploy/',
  '.claude/',
  '.github/',
]
const EXTENSIONS = [
  '.ts',
  '.tsx',
  '.css',
  '.md',
  '.mjs',
  '.sh',
  '.json',
  '.html',
  '.py',
  '.yml',
  '.yaml',
]
const LUS = ['.ts', '.tsx', '.mjs', '.md', '.css', '.sh', '.html']
const IGNORES = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'test-results',
  'playwright-report',
  /*
    Les deux répertoires de la vague de mutation. `.stryker-tmp` contient une
    **copie instrumentée de tout l'arbre source** : sans cette ligne, le
    script la parcourt et compte chaque citation deux fois. Mesuré le 30/08,
    juste après une vague : 782 occurrences au lieu de 259.

    Le verdict, lui, restait juste — ce sont les mêmes fichiers, donc les
    mêmes chemins. Mais le script *annonce un nombre*, et un nombre qui
    dépend de ce qui traîne sur le disque n'est pas une mesure. `dist` et
    `coverage` étaient déjà ignorés pour cette raison ; ceux-ci manquaient
    parce qu'ils n'existent qu'après une commande qu'on lance rarement.
  */
  '.stryker-tmp',
  'reports',
]

/**
 * Les chemins cités qu'on sait absents, et pourquoi on les cite quand même.
 *
 * Une exception sans raison lisible est une permission de se tromper.
 */
const ABSENTS_ASSUMES = new Map([
  [
    'tests/unit/reseauxFiltrables.test.ts',
    'le fichier fantôme du §4bis : deux commentaires le nomment pour raconter ' +
      "qu'il n'a jamais existé.",
  ],
])

function fichiersDuDepot(racine = '.') {
  const trouves = []
  for (const nom of readdirSync(racine)) {
    if (IGNORES.includes(nom)) continue
    const chemin = join(racine, nom)
    const infos = statSync(chemin)
    if (infos.isDirectory()) trouves.push(...fichiersDuDepot(chemin))
    else if (LUS.some((ext) => nom.endsWith(ext))) trouves.push(chemin)
  }
  return trouves
}

const CITATION = /`([^`\s]+)`/g

function citationsDe(texte) {
  const trouvees = []
  for (const trouve of texte.matchAll(CITATION)) {
    const chemin = trouve[1]
    if (chemin.includes('*')) continue
    if (!RACINES.some((r) => chemin.startsWith(r))) continue
    if (!EXTENSIONS.some((e) => chemin.endsWith(e))) continue
    trouvees.push(chemin)
  }
  return trouvees
}

const fantomes = []
const citesAuMoinsUneFois = new Set()
let total = 0

for (const fichier of fichiersDuDepot()) {
  const normalise = fichier.replace(/^\.\//, '')
  let texte
  try {
    texte = readFileSync(fichier, 'utf8')
  } catch {
    continue
  }
  for (const chemin of citationsDe(texte)) {
    total += 1
    citesAuMoinsUneFois.add(chemin)
    if (existsSync(chemin)) continue
    if (ABSENTS_ASSUMES.has(chemin)) continue
    fantomes.push({ ou: normalise, chemin })
  }
}

const exceptionsPerimees = [...ABSENTS_ASSUMES.keys()].filter((chemin) =>
  existsSync(chemin),
)

if (fantomes.length > 0) {
  console.error(
    `Chemins cités qui n'existent pas — ${String(fantomes.length)} :\n`,
  )
  for (const { ou, chemin } of fantomes) {
    console.error(`  ${ou}\n    cite \`${chemin}\`, qui n'existe pas`)
  }
  console.error(
    "\nUn commentaire qui nomme un fichier affirme qu'il existe (§4bis).\n" +
      "Corriger le chemin, créer le fichier, ou — s'il est cité justement\n" +
      'parce qu\'il est absent — l\'inscrire dans `ABSENTS_ASSUMES` avec sa\n' +
      'raison.',
  )
  process.exit(1)
}

if (exceptionsPerimees.length > 0) {
  console.error(
    'Exceptions devenues fausses : ces chemins existent désormais, et\n' +
      "`ABSENTS_ASSUMES` les laisse passer pour rien. Les en retirer :\n",
  )
  for (const chemin of exceptionsPerimees) console.error(`  ${chemin}`)
  process.exit(1)
}

console.log(
  `Chemins cités : ${String(total)} occurrences, ` +
    `${String(citesAuMoinsUneFois.size)} distincts, tous présents ` +
    `(${String(ABSENTS_ASSUMES.size)} absence assumée).`,
)
