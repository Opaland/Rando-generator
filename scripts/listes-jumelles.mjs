/**
 * Les listes jumelles — le mode d'échec du 25/08, rendu mécanique.
 *
 * Deux listes disaient la même règle : celle des commandes plancherisées par
 * `src/index.css`, et celle des commandes mesurées par la question 4 de
 * `tests/e2e/regles-d-ecran.spec.ts`. Elles avaient **le même trou** — ni
 * `select`, ni `input` hors `range`, ni `textarea` — et vingt-cinq commandes
 * du dépôt n'étaient donc ni tenues ni surveillées.
 *
 * Personne ne pouvait l'attraper en relisant un diff : les deux fichiers ne
 * changent pas ensemble, et chacun paraît complet isolément. C'est
 * exactement le §4 de CLAUDE.md — une garde transverse se nomme, elle ne se
 * recopie pas — sauf qu'ici la garde vit dans deux langages, et qu'aucune
 * fonction ne peut être partagée entre du CSS et du TypeScript.
 *
 * Ce que ce script vérifie, et **rien d'autre** : tout genre d'élément que le
 * CSS plancherise est mesuré par la sonde. L'inclusion va dans ce sens-là
 * seulement — la sonde a le droit de mesurer plus que ce que le CSS tient
 * (les boutons MapLibre, par exemple, qu'on relève sans bloquer).
 *
 * Ce qu'il ne prouve pas : que le plancher soit le bon, ni que la sonde
 * l'applique dans le bon état. Un script qui prétendrait cela mentirait.
 */
import { readFileSync } from 'node:fs'

const CSS = 'src/index.css'
const SONDE = 'tests/e2e/regles-d-ecran.spec.ts'

/**
 * Le « genre » d'un sélecteur : ce qu'il vise, dépouillé de ses conditions.
 *
 * `input:not([type='hidden'])` et `input[type='range']` visent tous deux des
 * `input` ; `label:has(> input[type='radio'])` vise un `label`. Comparer les
 * sélecteurs à la lettre serait un test qui échoue sur une reformulation —
 * donc un test qu'on finirait par désactiver.
 */
/**
 * Découpe une liste de sélecteurs sur les virgules **de premier niveau**.
 *
 * `String.split(',')` coupait à l'intérieur de
 * `:not([type='checkbox'], [type='radio'])` et rendait un genre `[type]`
 * qui n'existe pas. Un séparateur ne se lit pas hors de son contexte.
 */
function virgulesDePremierNiveau(liste) {
  const morceaux = []
  let courant = ''
  let profondeur = 0
  for (const c of liste) {
    if (c === '(' || c === '[') profondeur += 1
    else if (c === ')' || c === ']') profondeur -= 1
    if (c === ',' && profondeur === 0) {
      morceaux.push(courant)
      courant = ''
    } else courant += c
  }
  morceaux.push(courant)
  return morceaux
}

function genre(selecteur) {
  const nu = selecteur.trim()
  if (nu === '') return null
  const attribut = /^\[([a-zA-Z-]+)/.exec(nu)
  if (attribut) return `[${attribut[1]}]`
  const classe = /^\.([\w-]+)/.exec(nu)
  if (classe) return `.${classe[1]}`
  const balise = /^([a-zA-Z]+)/.exec(nu)
  return balise ? balise[1].toLowerCase() : null
}

/** Les sélecteurs auxquels `src/index.css` applique le plancher des cibles. */
function genresPlancherises(cssBrut) {
  // Les commentaires d'abord : ce module en porte de longs, et leurs mots
  // se lisaient comme des sélecteurs (« replier », « niveau », « cf »).
  const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, '')
  const genres = new Set()
  // Chaque bloc dont la déclaration pose `min-height: var(--cible-mini)`.
  const blocs = css.matchAll(
    /([^{}]+)\{[^{}]*min-height:\s*var\(--cible-mini\)[^{}]*\}/g,
  )
  for (const bloc of blocs) {
    for (const selecteur of virgulesDePremierNiveau(bloc[1])) {
      const g = genre(selecteur)
      if (g) genres.add(g)
    }
  }
  return genres
}

/** Les sélecteurs que la question 4 des règles d'écran interroge. */
function genresMesures(sonde) {
  const appel = /querySelectorAll\(\s*\n?\s*'([^']*(?:button|select)[^']*)'/.exec(
    sonde,
  )
  if (!appel) throw new Error(`Liste des cibles introuvable dans ${SONDE}`)
  const genres = new Set()
  for (const selecteur of virgulesDePremierNiveau(appel[1])) {
    const g = genre(selecteur.replace(/"/g, "'"))
    if (g) genres.add(g)
  }
  return genres
}

const plancherises = genresPlancherises(readFileSync(CSS, 'utf8'))
const mesures = genresMesures(readFileSync(SONDE, 'utf8'))

/*
  `.acc-summary` est une classe posée sur des `summary`, que la sonde
  interroge par la balise. L'écrire ici plutôt que d'assouplir `genre()` :
  une exception nommée se relit, une règle élargie se contourne.
*/
const EQUIVALENCES = new Map([
  ['.acc-summary', 'summary'],
  /*
    Le CSS plancherise le `label` d'une case à cocher ; la sonde interroge
    l'`input` et remonte à son étiquette. Les deux visent la même cible —
    celle que le doigt touche — par les deux bouts.
  */
  ['label', 'input'],
])

const oublies = [...plancherises].filter((g) => {
  const cible = EQUIVALENCES.get(g) ?? g
  return !mesures.has(cible)
})

if (oublies.length > 0) {
  console.error(
    `Le CSS plancherise ${String(oublies.length)} genre(s) que la sonde ne mesure pas : ${oublies.join(', ')}\n` +
      `  plancherisés : ${[...plancherises].sort().join(', ')}\n` +
      `  mesurés      : ${[...mesures].sort().join(', ')}\n` +
      `\nAjouter le genre manquant à la question 4 de ${SONDE}.`,
  )
  process.exit(1)
}

/*
  ─────────────────────────────────────────────────────────────────────────
  Deuxième paire : les couleurs de réseau, écrites à trois endroits.

  - les jetons de `src/index.css` — la source pour l'écran ;
  - `NETWORK_COLORS` de `src/lib/networkDisplay.ts`, en hexadécimal : le
    canevas de `summaryCard.ts` en a besoin, `var()` ne s'y résout pas ;
  - la table de `src/components/ProgressBalise.tsx`, en `var(--…)`, pour que
    la barre **suive** l'assombrissement du gros texte — ce que
    l'hexadécimal ne peut pas faire.

  Les deux dernières ne sont pas des doublons à fusionner : elles servent
  deux besoins différents, et c'est écrit dans les deux fichiers. Ce qui
  manquait est la garantie qu'elles désignent **la même couleur**. Elles
  s'accordaient à la main au 28/08, et rien ne le vérifiait — le §4ter dans
  sa forme ordinaire : deux listes justes qui cesseront de l'être un jour
  sans que le diff le montre.

  Ce que ce contrôle ne dit pas : si la couleur est la bonne. Ça se décide.
*/
const RESEAUX = 'src/lib/networkDisplay.ts'
const BARRE = 'src/components/ProgressBalise.tsx'

function tableDe(chemin, motif) {
  const source = readFileSync(chemin, 'utf8')
  const debut = source.indexOf('NETWORK_COLORS')
  if (debut === -1) {
    console.error(`NETWORK_COLORS introuvable dans ${chemin}.`)
    process.exit(1)
  }
  const bloc = source.slice(debut, source.indexOf('\n}\n', debut))
  return Object.fromEntries([...bloc.matchAll(motif)].map((m) => [m[1], m[2]]))
}

const hexParReseau = tableDe(RESEAUX, /(\w+):\s*'(#[0-9a-fA-F]{6})'/g)
const jetonParReseau = tableDe(BARRE, /(\w+):\s*'var\((--[\w-]+)\)'/g)

const racine = (() => {
  const css = readFileSync(CSS, 'utf8')
  const debut = css.indexOf(':root {')
  const bloc = css.slice(debut, css.indexOf('\n}', debut))
  return Object.fromEntries(
    [...bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  )
})()

const desaccords = []
for (const [reseau, hex] of Object.entries(hexParReseau)) {
  const jeton = jetonParReseau[reseau]
  if (!jeton) {
    desaccords.push(`${reseau} : ${BARRE} ne nomme aucun jeton`)
    continue
  }
  const valeur = racine[jeton]
  if (!valeur) {
    desaccords.push(`${reseau} : le jeton ${jeton} n'existe pas dans ${CSS}`)
    continue
  }
  if (valeur !== hex.toLowerCase()) {
    desaccords.push(`${reseau} : ${hex} ≠ ${jeton} qui vaut ${valeur}`)
  }
}
for (const reseau of Object.keys(jetonParReseau)) {
  if (!(reseau in hexParReseau)) {
    desaccords.push(`${reseau} : nommé par ${BARRE}, absent de ${RESEAUX}`)
  }
}

if (desaccords.length > 0) {
  console.error(
    `Les couleurs de réseau ne s'accordent plus — ${String(desaccords.length)} :\n` +
      desaccords.map((d) => `  ${d}`).join('\n') +
      `\n\nTrois listes disent la même couleur : les jetons de ${CSS},` +
      `\nl'hexadécimal de ${RESEAUX} et les var() de ${BARRE}.`,
  )
  process.exit(1)
}

/*
  ─────────────────────────────────────────────────────────────────────────
  Troisième paire : les personas de la skill `audit-ui` et leurs fiches.

  Le 28/08, `docs/PERSONAS.md` — le seul document dont c'est le métier —
  ignorait **Théo et Jeanine**. Ils sont pourtant nommés dans le §10 de
  CLAUDE.md, qui définit sur eux ce qui ne peut pas être fermé sans preuve
  humaine, dans la feuille de route, dans quatre fichiers de tests, dans
  `src/core/affichage.ts` et dans la skill `audit-ui`.

  Sept endroits les connaissaient, le document non. Aucun diff ne pouvait
  l'attraper : aucun ne touche ce document et les autres ensemble.

  Ce contrôle garde l'**existence d'une fiche**, jamais la justesse de ce
  qu'elle raconte — celle-là se relit, et le §2 interdit de prétendre mesurer
  ce qui se décide. Il ne dirait rien, par exemple, du fait que la Sylvie de
  la skill est « en montagne, gantée » quand celle du document « débute la
  randonnée » : deux accents à réconcilier à la main.
*/
const SKILL_AUDIT = '.claude/skills/audit-ui/SKILL.md'
const PERSONAS = 'docs/PERSONAS.md'

const nommesParLaSkill = [
  ...readFileSync(SKILL_AUDIT, 'utf8').matchAll(
    /^- \*\*([A-ZÉÈÀÎÔ][\p{L}-]+)\*\*/gmu,
  ),
].map((m) => m[1])

if (nommesParLaSkill.length === 0) {
  console.error(
    `Aucun persona trouvé dans ${SKILL_AUDIT} : le motif de lecture ne` +
      ` correspond plus, et ce contrôle ne garde donc plus rien.`,
  )
  process.exit(1)
}

const fiches = new Set(
  [...readFileSync(PERSONAS, 'utf8').matchAll(/^## ([A-ZÉÈÀÎÔ][\p{L}-]+)/gmu)].map(
    (m) => m[1],
  ),
)

const sansFiche = nommesParLaSkill.filter((nom) => !fiches.has(nom))
if (sansFiche.length > 0) {
  console.error(
    `${String(sansFiche.length)} persona(s) nommé(s) par ${SKILL_AUDIT} sans` +
      ` fiche dans ${PERSONAS} : ${sansFiche.join(', ')}\n` +
      `\nUn persona qui choisit où l'on regarde mérite d'exister là où on` +
      ` les décrit.`,
  )
  process.exit(1)
}

console.log(
  `Listes jumelles d'accord : ${String(plancherises.size)} genres plancherisés, ` +
    `tous mesurés ; ${String(Object.keys(hexParReseau).length)} couleurs de réseau, ` +
    `les trois listes d'accord ; ` +
    `${String(nommesParLaSkill.length)} personas de la skill, tous avec leur fiche.`,
)
