/**
 * Audit de la suite e2e — ce qui se mesure, et rien d'autre.
 *
 * Demande de Cédric, 25/08 : « plein de tests e2e — robustesse ? utilité ?
 * redondance ? pertinence ? faut-il en fusionner ? »
 *
 * Ce script ne dit pas si un test est *bon*. Il rend cinq chiffres par
 * fichier, plus les recouvrements entre fichiers, pour que la lecture porte
 * sur des candidats et non sur une impression. Le §2 interdit de prétendre
 * mesurer ce qui se décide — et « ce test est utile » se décide.
 *
 * Ce qu'il mesure, et pourquoi chaque nombre veut dire quelque chose :
 *
 * - **`waitForTimeout`** : une attente fixe. Elle passe sur une machine
 *   rapide et tombe sous charge — c'est la famille du §6ter, et le dépôt en
 *   a trois cas datés ;
 * - **`toBeVisible` / `toContainText` nus** : le §1bis. `toBeVisible` accepte
 *   un élément écrêté par un ancêtre en `overflow: hidden` ; `toContainText`
 *   lit du `display: none`. Ce ne sont pas des interdits — ce sont des
 *   assertions qui peuvent passer pour une raison qu'on n'a pas voulue ;
 * - **`elementFromPoint` / `estAlEcran`** : la mesure de ce qui est *peint*.
 *   Un fichier qui en a est un fichier qui a déjà rencontré le piège ;
 * - **les `data-testid` assertés** : la signature d'un fichier. Deux
 *   fichiers qui touchent aux mêmes sont des candidats à la fusion ;
 * - **les `data-testid` morts** : cités par un test, absents des sources.
 *
 * Un fichier avec beaucoup de `toBeVisible` n'est pas fautif. Un fichier
 * avec beaucoup de `toBeVisible` **et** aucune mesure de peinture **et** un
 * recouvrement fort avec un voisin est un candidat à la lecture.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DOSSIER = 'tests/e2e'
const SOURCES = 'src'

function tousLesFichiers(racine, suffixe) {
  const sortie = []
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name)
    if (entree.isDirectory()) sortie.push(...tousLesFichiers(chemin, suffixe))
    else if (entree.name.endsWith(suffixe)) sortie.push(chemin)
  }
  return sortie
}

/**
 * Les testids que les sources posent réellement.
 *
 * **Première écriture : trois faux positifs.** Elle ne lisait que
 * `data-testid="..."` et les gabarits directs, et déclarait morts
 * `global-vide`, `global-km` et `global-declare-etat` — qui sont produits
 * par un ternaire dans `Dashboard.tsx` :
 *
 *     etatBilan === 'mesure' ? 'global-km' : `global-${...}`
 *
 * J'allais rapporter trois tests obsolètes qui ne l'étaient pas. La skill
 * `audit-ui` le dit : vérifier à la main le premier résultat de tout script
 * de revue avant d'en rapporter quoi que ce soit.
 *
 * On collecte donc **toutes les chaînes littérales des sources**, plus les
 * préfixes de gabarits. C'est volontairement large : un faux **négatif**
 * (un testid mort qu'on rate) coûte moins qu'un faux positif, qui envoie
 * quelqu'un corriger un test qui va très bien.
 */
const testidsVivants = new Set()
const prefixesVivants = []
for (const f of tousLesFichiers(SOURCES, '.tsx').concat(
  tousLesFichiers(SOURCES, '.ts'),
)) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9_-]*)['"`]/g)) {
    testidsVivants.add(m[1])
  }
  for (const m of src.matchAll(/`([a-zA-Z0-9_-]+-)\$\{/g)) {
    prefixesVivants.push(m[1])
  }
}

const compte = (texte, motif) => (texte.match(motif) ?? []).length

const fiches = []
for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith('.spec.ts'))) {
  const texte = readFileSync(join(DOSSIER, nom), 'utf8')
  const testids = new Set(
    [...texte.matchAll(/getByTestId\(\s*[`'"]([a-zA-Z0-9_${}.-]+)/g)].map(
      (m) => m[1],
    ),
  )
  fiches.push({
    nom,
    tests: compte(texte, /^\s*test(\.\w+)?\(/gm),
    lignes: texte.split('\n').length,
    attentesFixes: compte(texte, /waitForTimeout/g),
    visibleNu: compte(texte, /toBeVisible\(|toContainText\(/g),
    peinture: compte(texte, /elementFromPoint|estAlEcran/g),
    convergence: compte(texte, /expect\s*\.?\s*\n?\s*\.poll\(|expect\.poll\(/g),
    testids,
  })
}

// ---- 1. Les testids morts -------------------------------------------------
const morts = new Map()
for (const f of fiches) {
  for (const id of f.testids) {
    if (id.includes('$')) continue
    const vivant =
      testidsVivants.has(id) ||
      prefixesVivants.some((prefixe) => id.startsWith(prefixe))
    if (!vivant) {
      if (!morts.has(id)) morts.set(id, [])
      morts.get(id).push(f.nom)
    }
  }
}

// ---- 2. Le recouvrement entre fichiers ------------------------------------
function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}
const paires = []
for (let i = 0; i < fiches.length; i += 1) {
  for (let j = i + 1; j < fiches.length; j += 1) {
    const a = fiches[i]
    const b = fiches[j]
    if (a.testids.size < 3 || b.testids.size < 3) continue
    const score = jaccard(a.testids, b.testids)
    if (score >= 0.5) paires.push({ a: a.nom, b: b.nom, score, communs: [...a.testids].filter((x) => b.testids.has(x)).length })
  }
}
paires.sort((x, y) => y.score - x.score)

// ---- 3. Le rendu ----------------------------------------------------------
const total = (clef) => fiches.reduce((s, f) => s + f[clef], 0)

console.log(`# Audit de la suite e2e\n`)
console.log(
  `${String(fiches.length)} fichiers, ${String(total('tests'))} tests, ` +
    `${String(total('lignes'))} lignes.\n`,
)

console.log(`## Attentes fixes (waitForTimeout) — la famille du §6ter\n`)
const fixes = fiches.filter((f) => f.attentesFixes > 0)
if (fixes.length === 0) console.log('Aucune.\n')
else {
  for (const f of fixes.sort((a, b) => b.attentesFixes - a.attentesFixes)) {
    console.log(`- ${f.nom} : ${String(f.attentesFixes)}`)
  }
  console.log(`\nTotal : ${String(total('attentesFixes'))}\n`)
}

console.log(`## Assertions du §1bis sans mesure de peinture\n`)
console.log(
  `Fichiers avec au moins 8 \`toBeVisible\`/\`toContainText\` et **aucun** ` +
    `\`elementFromPoint\`/\`estAlEcran\` :\n`,
)
const aveugles = fiches
  .filter((f) => f.visibleNu >= 8 && f.peinture === 0)
  .sort((a, b) => b.visibleNu - a.visibleNu)
for (const f of aveugles) {
  console.log(
    `- ${f.nom} : ${String(f.visibleNu)} assertions, ${String(f.convergence)} convergence(s)`,
  )
}
console.log('')

console.log(`## Testids cités par un test, absents des sources\n`)
if (morts.size === 0) console.log('Aucun.\n')
else {
  for (const [id, ou] of [...morts].sort()) {
    console.log(`- \`${id}\` — ${ou.join(', ')}`)
  }
  console.log('')
}

console.log(`## Recouvrement des surfaces touchées (Jaccard ≥ 0,5)\n`)
if (paires.length === 0) console.log('Aucune paire.\n')
else {
  for (const p of paires.slice(0, 20)) {
    console.log(
      `- ${(p.score * 100).toFixed(0)} % — ${p.a} ↔ ${p.b} (${String(p.communs)} testids communs)`,
    )
  }
  console.log('')
}
