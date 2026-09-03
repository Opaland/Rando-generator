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
import { readFileSync, readdirSync } from 'node:fs'

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
  [...readFileSync(PERSONAS, 'utf8').matchAll(/^#{2,3} ([A-ZÉÈÀÎÔ][\p{L}-]+)/gmu)].map(
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

/*
  Quatrième paire : ce que la sonde d'écran mesure, et ce que les documents
  en annoncent.

  Le 28/08, quatre heures après avoir ajouté la tablette (#363), `CLAUDE.md`
  §6quinquies et la skill `audit-ui` annonçaient toujours « trois largeurs et
  six états ». La sonde en mesurait **quatre et huit**, et la skill
  **énumérait** les largeurs : « 390 tactile, 800 tactile, 1280 non ». 1024
  n'apparaissait nulle part (issue #367).

  Une procédure qui décrit un outil disparu fait pire que ne rien dire : elle
  donne l'assurance d'avoir couvert ce qu'on n'a pas couvert. Qui la suit à la
  main prend trois captures et manque la seule vue large **et** tactile.

  Trois inventaires sont comparés ici, et rien d'autre :

  1. les largeurs énumérées par la skill ;
  2. les commandes de la porte listées par le §6 de `CLAUDE.md` ;
  3. les comptes annoncés dans les deux phrases **définitionnelles**.

  ## Ce que ce contrôle refuse de faire

  Il ne compte pas toutes les occurrences de « N états » du dépôt. Le §6ter
  raconte une mesure datée — « rouge sur les six états » — qui était vraie ce
  jour-là. Le récit d'une mesure ne se réécrit pas parce que l'outil a grandi
  depuis : ce serait falsifier l'histoire pour faire passer un contrôle. Le
  §4bis dit qu'une justification vieillit ; il ne dit pas de la rajeunir de
  force.

  Il ne dit rien non plus de la justesse des phrases autour. Ça se relit, et
  le §2 interdit de prétendre mesurer ce qui se décide.
*/
const SONDE_ECRAN = 'tests/e2e/regles-d-ecran.spec.ts'
const REGLES = 'CLAUDE.md'
const CI = '.github/workflows/ci.yml'

/** Le contenu d'un `const NOM = [ … ] as const`, sans quoi on ne mesure rien. */
function blocDeConstante(source, nom, ou) {
  const debut = source.indexOf(`const ${nom} = [`)
  if (debut === -1) {
    echouer(
      `\`const ${nom} = [\` est introuvable dans ${ou} : le motif de lecture ne` +
        ` correspond plus, et ce contrôle ne garde donc plus rien.`,
    )
  }
  const fin = source.indexOf('] as const', debut)
  if (fin === -1) echouer(`La fin de \`${nom}\` est introuvable dans ${ou}.`)
  return source.slice(debut, fin)
}

function echouer(message) {
  console.error(message)
  process.exit(1)
}

const sondeSource = readFileSync(SONDE_ECRAN, 'utf8')

const largeurs = [
  ...blocDeConstante(sondeSource, 'LARGEURS', SONDE_ECRAN).matchAll(
    /\bwidth:\s*(\d+)/g,
  ),
].map((m) => Number(m[1]))
if (largeurs.length === 0) echouer(`Aucune largeur lue dans ${SONDE_ECRAN}.`)

// Les états sont des chaînes nues, une par ligne ; les commentaires du bloc
// commencent par `*` ou `/*` et ne peuvent donc pas être pris pour l'un d'eux.
const etats = [
  ...blocDeConstante(sondeSource, 'ETATS', SONDE_ECRAN).matchAll(
    /^ {2}'([^']+)',$/gm,
  ),
].map((m) => m[1])
if (etats.length === 0) echouer(`Aucun état lu dans ${SONDE_ECRAN}.`)

const skillSource = readFileSync(SKILL_AUDIT, 'utf8')

/*
  La ligne qui prétend énumérer les largeurs. On l'ancre sur « À N largeurs (»
  — la parenthèse est ce qui distingue une énumération d'une simple mention.
*/
const enumeration = /^À\s+\p{L}+\s+largeurs\s*\(([^)]*)\)/mu.exec(skillSource)
if (!enumeration) {
  echouer(
    `La ligne « À … largeurs (…) » est introuvable dans ${SKILL_AUDIT} : le` +
      ` motif de lecture ne correspond plus, et ce contrôle ne garde donc` +
      ` plus rien.`,
  )
}
const nonEnumerees = largeurs.filter(
  (l) => !new RegExp(`\\b${String(l)}\\b`).test(enumeration[1]),
)
if (nonEnumerees.length > 0) {
  echouer(
    `${String(nonEnumerees.length)} largeur(s) mesurée(s) par ${SONDE_ECRAN}` +
      ` et absente(s) de l'énumération de ${SKILL_AUDIT} :` +
      ` ${nonEnumerees.join(', ')}\n` +
      `\nL'énumération lue : « ${enumeration[1]} »\n` +
      `\nUne procédure qui énumère trois vues quand la sonde en mesure quatre` +
      ` donne l'assurance d'avoir couvert ce qu'on n'a pas couvert.`,
  )
}

/** Les nombres qu'un document écrit en toutes lettres. */
const EN_LETTRES = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
  'vingt',
]

/**
 * Le compte annoncé devant un mot, dans **une** phrase désignée.
 *
 * On ne balaie pas le fichier : seules les phrases définitionnelles sont
 * comparées, pour la raison écrite en tête de section.
 */
function compteAnnonce(phrase, mot) {
  // `[\p{L}-]+` et non `\p{L}+` : « dix-neuf » porte un trait d'union, et
  // s'arrêter à « dix » aurait rendu un compte faux au lieu d'un échec.
  const trouve = new RegExp(`([\\p{L}-]+|\\d+)\\s+${mot}\\b`, 'u').exec(phrase)
  if (!trouve) return -1
  const brut = trouve[1].toLowerCase()
  return /^\d+$/.test(brut) ? Number(brut) : EN_LETTRES.indexOf(brut)
}

const phrasesDefinitionnelles = [
  {
    ou: `${REGLES} §6quinquies`,
    // La phrase qui définit la sonde, par opposition aux récits datés du §6ter.
    phrase: (() => {
      const source = readFileSync(REGLES, 'utf8')
      const depart = source.indexOf('questions mesurables')
      if (depart === -1) {
        echouer(
          `« questions mesurables » est introuvable dans ${REGLES} : l'ancre` +
            ` de la phrase définitionnelle ne correspond plus, et ce contrôle` +
            ` ne garde donc plus rien.`,
        )
      }
      return source.slice(depart, source.indexOf('.', depart) + 1)
    })(),
  },
  {
    ou: `${SKILL_AUDIT} (description)`,
    phrase: (() => {
      const ligne = /^description:.*$/m.exec(skillSource)
      if (!ligne) {
        echouer(`La ligne \`description:\` est introuvable dans ${SKILL_AUDIT}.`)
      }
      return ligne[0]
    })(),
  },
]

for (const { ou, phrase } of phrasesDefinitionnelles) {
  for (const [mot, attendu] of [
    ['largeurs', largeurs.length],
    ['états', etats.length],
  ]) {
    const annonce = compteAnnonce(phrase, mot)
    if (annonce === -1) {
      echouer(
        `Aucun compte lisible devant « ${mot} » dans ${ou} : le motif de` +
          ` lecture ne correspond plus, et ce contrôle ne garde donc plus rien.` +
          `\nPhrase lue : « ${phrase.trim()} »`,
      )
    }
    if (annonce !== attendu) {
      echouer(
        `${ou} annonce ${EN_LETTRES[annonce]} ${mot}, la sonde en mesure` +
          ` ${String(attendu)}.\n` +
          `\nPhrase lue : « ${phrase.trim()} »`,
      )
    }
  }
}

/*
  Le README annonce un nombre de personas, `docs/PERSONAS.md` en tient un
  autre.

  Il disait « Six personnes suivies pas à pas » quand le document en portait
  **dix**, et dix-neuf après la passe du 28/08. Personne ne pouvait le voir :
  le README et ce document ne changent jamais dans le même diff, et chacun
  paraît complet quand on le lit seul.

  On compte les **personnes**, pas les titres. Le document revient sur Sylvie
  et sur Bernard dans une seconde passe, sous un titre qui porte leur prénom :
  compter les titres rendait vingt là où il y a dix-huit personnes. C'est le
  piège que la skill de revue globale nomme — vérifier à la main le premier
  résultat de tout script de revue — et il s'est refermé au premier essai.
*/
const LISEZ_MOI = 'README.md'

const fichesDePersonas = new Set(
  [
    ...readFileSync(PERSONAS, 'utf8').matchAll(
      /^#{2,3} ([A-ZÉÈÀÎÔ][\p{L}-]*), /gmu,
    ),
  ].map((m) => m[1]),
).size
if (fichesDePersonas === 0) {
  echouer(
    `Aucune fiche de persona lue dans ${PERSONAS} : le motif de lecture ne` +
      ` correspond plus, et ce contrôle ne garde donc plus rien.`,
  )
}

const ligneDuTableau = /^.*personnes suivies pas à pas.*$/m.exec(
  readFileSync(LISEZ_MOI, 'utf8'),
)
if (!ligneDuTableau) {
  echouer(
    `« personnes suivies pas à pas » est introuvable dans ${LISEZ_MOI} :` +
      ` l'ancre ne correspond plus, et ce contrôle ne garde donc plus rien.`,
  )
}
const annoncePersonas = compteAnnonce(ligneDuTableau[0], 'personnes')
if (annoncePersonas !== fichesDePersonas) {
  echouer(
    `${LISEZ_MOI} annonce ${annoncePersonas === -1 ? 'un compte illisible' : String(annoncePersonas)}` +
      ` personne(s) suivie(s) pas à pas, ${PERSONAS} en tient` +
      ` ${String(fichesDePersonas)}.\n` +
      `\nLigne lue : « ${ligneDuTableau[0].trim()} »`,
  )
}

/*
  La porte, telle que le §6 l'énumère.

  Trois commandes y manquaient — `listes`, `textes`, `chemins` — dont deux
  que ce même fichier présente ailleurs. La troisième, `chemins`, a été
  écrite pour attraper « un commentaire qui nomme un fichier affirme qu'il
  existe » (#357) ; personne n'a pensé à la citer dans la liste des gardes.
*/
const regles = readFileSync(REGLES, 'utf8')
const departPorte = regles.indexOf('La porte complète avant de committer')
if (departPorte === -1) {
  echouer(
    `« La porte complète avant de committer » est introuvable dans ${REGLES} :` +
      ` le motif de lecture ne correspond plus, et ce contrôle ne garde donc` +
      ` plus rien.`,
  )
}
const paragraphePorte = regles.slice(
  departPorte,
  regles.indexOf('\n\n', departPorte),
)
const citeesParLeSix = new Set(
  [...paragraphePorte.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]),
)

// `monkey` ne tourne pas en CI — trop lent — mais il fait partie de la porte.
const commandesDeLaPorte = [
  ...new Set([
    ...[...readFileSync(CI, 'utf8').matchAll(/npm run ([a-z0-9-]+)/g)].map(
      (m) => m[1],
    ),
    'monkey',
  ]),
]
if (commandesDeLaPorte.length <= 1) {
  echouer(`Aucun \`npm run\` lu dans ${CI} : ce contrôle ne garde plus rien.`)
}
const absentesDuSix = commandesDeLaPorte.filter((c) => !citeesParLeSix.has(c))
if (absentesDuSix.length > 0) {
  echouer(
    `${String(absentesDuSix.length)} commande(s) de la porte absente(s) du §6` +
      ` de ${REGLES} : ${absentesDuSix.join(', ')}\n` +
      `\nUne garde qu'on oublie de citer dans la liste des gardes est une` +
      ` garde qu'on oubliera de lancer.`,
  )
}

/*
  Sixième paire : ce que le hook de pré-commit lance, et ce que son en-tête
  annonce.

  Il disait « Ne contient QUE ce qui tient en moins d'une minute : lint,
  listes jumelles, typecheck, tests unitaires » et en lançait **six** —
  `textes` et `chemins` manquaient. Les deux avaient été ajoutés avec leur
  propre commentaire explicatif, juste au-dessus de leur ligne ; l'en-tête,
  six lignes plus haut, n'a pas suivi (issue #367).

  Celle-ci tranche une hypothèse. Ce n'est pas que la documentation vieillit
  parce qu'elle est **loin** du code : ici les deux sont dans le même
  fichier, à six lignes d'écart. C'est qu'aucune énumération n'est comparée à
  ce qu'elle énumère, où qu'elle vive.

  Elle est aussi la plus facile à garder des quatre, pour la même raison :
  les deux côtés sont dans un seul fichier.
*/
const HOOK = '.claude/hooks/porte-avant-commit.sh'

const hookSource = readFileSync(HOOK, 'utf8')

const lanceesParLeHook = [
  ...hookSource.matchAll(/^lancer\s+"([a-z0-9-]+)"/gm),
].map((m) => m[1])
if (lanceesParLeHook.length === 0) {
  echouer(
    `Aucun \`lancer "…"\` lu dans ${HOOK} : le motif de lecture ne correspond` +
      ` plus, et ce contrôle ne garde donc plus rien.`,
  )
}

const departEnTete = hookSource.indexOf('Ne contient QUE')
if (departEnTete === -1) {
  echouer(
    `« Ne contient QUE » est introuvable dans ${HOOK} : l'ancre de l'en-tête` +
      ` ne correspond plus, et ce contrôle ne garde donc plus rien.`,
  )
}
// Les `#` de commentaire retirés : ils coupent les mots d'une ligne à l'autre.
const enTete = hookSource
  .slice(departEnTete, hookSource.indexOf('.', departEnTete) + 1)
  .replace(/^\s*#\s?/gm, '')

const nonAnnoncees = lanceesParLeHook.filter(
  (nom) => !new RegExp(`(?<![\\p{L}-])${nom}(?![\\p{L}-])`, 'u').test(enTete),
)
if (nonAnnoncees.length > 0) {
  echouer(
    `${String(nonAnnoncees.length)} commande(s) lancée(s) par ${HOOK} et` +
      ` absente(s) de son propre en-tête : ${nonAnnoncees.join(', ')}\n` +
      `\nEn-tête lu : « ${enTete.replace(/\s+/g, ' ').trim()} »\n` +
      `\nUne énumération à six lignes du code qu'elle décrit vieillit comme` +
      ` les autres.`,
  )
}

/*
  Septième paire : ce que la démonstration masque, et ce que la sortie relit.

  L'hydratation du store refuse d'écraser trois listes tant qu'une
  démonstration tourne — sinon le visiteur verrait ses vraies sorties et les
  trois fictives dans le même pourcentage. `quitterDemonstration` les relit
  en sortant, ce qui rend le masquage sans conséquence.

  Les deux disent la même règle, dans deux fichiers, et **une seule était
  gardée** : `tests/unit/trancheDemonstration.test.ts` tient la relecture,
  rien ne tient le masquage. Une quatrième liste masquée sans être relue se
  perdrait en silence — et seulement chez quelqu'un qui avait déjà des
  données, donc jamais chez un nouveau venu ni dans un test partant d'une
  base vide (issue #368).

  La cicatrice précédente est arrivée exactement par là : les déclarations de
  #158 étaient masquées avant d'être relues.
*/
const HYDRATATION = 'src/store/appStore.ts'
const SORTIE = 'src/store/trancheDemonstration.ts'

const masquees = [
  ...new Set(
    [
      ...readFileSync(HYDRATATION, 'utf8').matchAll(
        /^\s*([a-zA-Z]+):\s*\n?\s*enDemonstration$|^\s*([a-zA-Z]+): enDemonstration/gm,
      ),
    ].map((m) => m[1] ?? m[2]),
  ),
].filter((nom) => nom !== undefined)

if (masquees.length === 0) {
  echouer(
    `Aucune liste masquée lue dans ${HYDRATATION} : le motif` +
      ` « clé: enDemonstration ? … » ne correspond plus, et ce contrôle ne` +
      ` garde donc plus rien.`,
  )
}

const sourceSortie = readFileSync(SORTIE, 'utf8')

/*
  Ancré sur la **déstructuration de la lecture de base**, et non sur un
  `deps.set({ … })`.

  Le fichier en contient plusieurs — `demarrerDemonstration` et
  `arreterDemonstration` en appellent aussi. Un motif qui cherche le premier
  attrape donc le mauvais. La première écriture de ce contrôle marchait par
  accident : `[^}]+` s'arrêtait sur les accolades imbriquées des appels
  précédents, ce qui le faisait tomber sur le bon par hasard. Assoupli en
  `[\s\S]*?` pour tolérer un reformatage, il attrapait aussitôt le premier
  venu — et rendait « les trois listes ne sont pas relues », ce qui est faux.

  §1bis, sur ma propre garde : elle était verte pour une raison que je
  n'avais pas voulue.

  `const [a, b, c] = await Promise.all(` ne se produit qu'une fois, et nomme
  exactement ce qui est relu de la base.
*/
const relues = [
  ...(
    /const \[([^\]]+)\] = await Promise\.all\(/.exec(sourceSortie)?.[1] ?? ''
  ).matchAll(/([a-zA-Z]+)/g),
].map((m) => m[1])

if (relues.length === 0) {
  echouer(
    `Aucune liste relue lue dans ${SORTIE} : le motif` +
      ` « const [\u2026] = await Promise.all( » ne correspond plus, et ce` +
      ` contrôle ne garde donc plus rien.`,
  )
}

const masqueesSansRelecture = masquees.filter((nom) => !relues.includes(nom))
const reluesSansMasquage = relues.filter((nom) => !masquees.includes(nom))

if (masqueesSansRelecture.length > 0 || reluesSansMasquage.length > 0) {
  echouer(
    `La démonstration masque et relit deux listes différentes.\n` +
      `Masquée sans être relue : ${masqueesSansRelecture.join(', ') || '—'}\n` +
      `  → perdue en sortant, et seulement chez quelqu'un qui en avait.\n` +
      `Relue sans être masquée : ${reluesSansMasquage.join(', ') || '—'}\n` +
      `  → relecture inutile, ou masquage oublié.\n` +
      `\nLes deux côtés disent la même règle : ${HYDRATATION} et ${SORTIE}.`,
  )
}

/*
  ===========================================================================
  Huitième paire : le crédit des sources, dans le HTML servi tel quel.
  ===========================================================================

  `public/pourquoi.html` est une page statique, hors du bundle : elle ne peut
  importer ni `src/lib/attribution.ts` ni quoi que ce soit. Elle portait donc
  la phrase de crédit **recopiée**, et le 29/08 elle a divergé — l'application
  disait « Fond © IGN (Plan IGN, licence ouverte Etalab) », la page dehors
  disait encore « Fond de carte © IGN (Etalab 2.0) ».

  Aucun diff ne pouvait le montrer : `App.tsx` et `pourquoi.html` ne changent
  jamais ensemble, et chacun paraît complet quand on le lit seul. §4ter, à la
  lettre — et §3, qui dit que le README n'est pas la seule surface qu'une
  correction de texte oublie.

  Le partage étant impossible, c'est le remède 2 : **un contrôle qui asserte
  que les deux sont d'accord**. Il reconstruit la phrase depuis les morceaux
  de `attribution.ts` et exige de la retrouver dans la page.
*/
const CREDITS = 'src/lib/attribution.ts'
const POURQUOI = 'public/pourquoi.html'

const sourceCredits = readFileSync(CREDITS, 'utf8')

/** Lit un `export const NOM: Credit = { … }` et en rend les champs. */
function creditNomme(nom) {
  const bloc = new RegExp(
    `export const ${nom}: Credit = \\{([\\s\\S]*?)\\n\\}`,
  ).exec(sourceCredits)?.[1]
  if (bloc === undefined) {
    echouer(
      `Le crédit « ${nom} » ne se lit plus dans ${CREDITS} : le motif` +
        ` « export const ${nom}: Credit = { … } » ne correspond plus, et ce` +
        ` contrôle ne garde donc plus rien.`,
    )
  }
  const champ = (cle) =>
    new RegExp(`\\b${cle}: '([^']*)'`).exec(bloc)?.[1] ?? null
  return {
    quoi: champ('quoi'),
    devant: champ('devant') ?? '',
    qui: champ('qui'),
    licence: champ('licence'),
  }
}

const enTexte = (c) => `${c.quoi} © ${c.devant}${c.qui} (${c.licence})`

const osm = creditNomme('OSM')
const ign = creditNomme('IGN')

for (const [nom, credit] of [
  ['OSM', osm],
  ['IGN', ign],
]) {
  if (credit.quoi === null || credit.qui === null || credit.licence === null) {
    echouer(
      `Le crédit « ${nom} » a perdu un de ses champs dans ${CREDITS}` +
        ` (quoi / qui / licence). La phrase reconstruite serait fausse, et ce` +
        ` contrôle comparerait n'importe quoi.`,
    )
  }
}

const marques = /MARQUES_FFRANDONNEE =\n\s*'([^']*)'/.exec(sourceCredits)?.[1]
if (marques === undefined) {
  echouer(
    `MARQUES_FFRANDONNEE ne se lit plus dans ${CREDITS} : ce contrôle ne` +
      ` garde donc plus la mention de marque.`,
  )
}

/*
  Reconstruite dans l'ordre qu'emploie le pied du panneau — OSM puis IGN,
  puis les marques. C'est la phrase que `App.tsx` compose ; celle du papier
  en ajoute la Métropole et ne se compare pas ici, `pourquoi.html` n'ayant
  pas de feuille à imprimer.
*/
const creditAttendu = `${enTexte(osm)} · ${enTexte(ign)} · ${marques}`

/*
  Espacement normalisé : le HTML est replié à 80 colonnes, la phrase y est
  donc coupée par des retours à la ligne qui ne changent rien à ce qui
  s'affiche. Comparer à la lettre ferait échouer ce contrôle sur un
  reformatage, c'est-à-dire un contrôle qu'on finirait par désactiver.
*/
const aplati = (texte) => texte.replace(/\s+/g, ' ').trim()
const sourcePourquoi = aplati(readFileSync(POURQUOI, 'utf8'))

if (!sourcePourquoi.includes(aplati(creditAttendu))) {
  echouer(
    `${POURQUOI} ne porte pas le crédit que ${CREDITS} compose.\n` +
      `Attendu : ${creditAttendu}\n` +
      `  → la page publique est servie hors du bundle : elle ne peut pas` +
      ` importer les morceaux, donc elle les recopie, donc elle dérive.` +
      ` C'est la surface qu'une correction de texte oublie (§3).`,
  )
}

/*
  ===========================================================================
  Neuvième paire : le poids d'une tuile, dans le code et dans la mesure.
  ===========================================================================

  `POIDS_MOYEN_PAR_ZOOM` (src/core/telechargement.ts) porte cinq nombres que
  le bouton « Emporter » affiche, et `docs/MESURE_TUILES.md` porte les mêmes,
  dans le tableau qui les a produits.

  Ils ne peuvent pas être partagés : un document n'importe rien. Ils ne
  changent jamais ensemble non plus — une nouvelle campagne de mesure touche
  le document, un ajustement touche le code — et chacun paraît complet quand
  on le lit seul. §4ter à la lettre, donc remède 2 : un contrôle qui asserte
  que les deux sont d'accord.

  Ce qui compte ici n'est pas la valeur mais la **traçabilité** : un chiffre
  affiché à l'utilisateur doit se retrouver dans la mesure qui le justifie,
  sinon la justification est un commentaire qui affirme (§4bis).
*/
const POIDS_CODE = 'src/core/telechargement.ts'
const POIDS_DOC = 'docs/MESURE_TUILES.md'

const sourcePoids = readFileSync(POIDS_CODE, 'utf8')
const blocPoids = /POIDS_MOYEN_PAR_ZOOM: Record<number, number> = \{([^}]*)\}/.exec(
  sourcePoids,
)
if (!blocPoids) {
  echouer(
    `${POIDS_CODE} : POIDS_MOYEN_PAR_ZOOM est introuvable sous la forme` +
      ` attendue. Le motif de lecture ne correspond plus, ce contrôle ne` +
      ` garde donc plus rien — le réparer plutôt que le retirer.`,
  )
}
const poidsParZoom = new Map()
for (const [, z, valeur] of blocPoids[1].matchAll(
  /(\d+):\s*([\d_]+)/g,
)) {
  poidsParZoom.set(Number(z), Number(valeur.replaceAll('_', '')))
}
if (poidsParZoom.size === 0) {
  echouer(`${POIDS_CODE} : aucun poids lu dans POIDS_MOYEN_PAR_ZOOM.`)
}

const sourceMesure = readFileSync(POIDS_DOC, 'utf8')
for (const [zoom, octets] of poidsParZoom) {
  /*
    Le document écrit ses nombres à la française — « 105 422 », espace
    insécable comprise selon l'éditeur. On compare donc sur les chiffres
    seuls, pas sur leur mise en forme.
  */
  const chiffres = String(octets)
  const present = sourceMesure
    .replaceAll(/[\u00a0\u202f ]/g, '')
    .includes(chiffres)
  if (!present) {
    echouer(
      `Le poids du zoom ${String(zoom)} vaut ${chiffres} o dans` +
        ` ${POIDS_CODE}, et ${POIDS_DOC} ne le porte nulle part.\n` +
        `  → ce nombre s'affiche à l'utilisateur ; s'il ne se retrouve pas` +
        ` dans la mesure qui le justifie, la justification n'affirme plus` +
        ` rien (§4bis), et les deux listes ont dérivé (§4ter).`,
    )
  }
}


/* --------------------------------------------------------------------------
   Les commandes qui lancent Playwright, et celles qui sont annoncées avec
   PW_CHROMIUM_PATH (issue #435).

   `playwright.config.ts` lit cette variable pour **toute** exécution. Quatre
   scripts de `package.json` en dépendent donc, et un seul était annoncé avec
   elle — dans le README comme dans le §6. Le 31/08, `npm run monkey` a rendu
   trois échecs au milieu d'une porte verte pour cette seule raison.

   Ce n'est pas un faux vert : le navigateur ne se lance pas du tout, l'échec
   est bruyant. C'est une porte rouge pour une raison qui n'est pas celle
   qu'on cherche, au pire moment.

   La liste vit dans `package.json` ; les deux autres la décrivent. Un script
   neuf qui lance Playwright sans être nommé dans les deux fait échouer ici.
   -------------------------------------------------------------------------- */

const PAQUET = 'package.json'
const README_PW = 'README.md'
const REGLES_PW = 'CLAUDE.md'

const scripts = JSON.parse(readFileSync(PAQUET, 'utf8')).scripts ?? {}
const lancentPlaywright = Object.entries(scripts)
  .filter(([, commande]) => /(^|\s)(npx )?playwright test(\s|$)/.test(commande))
  .map(([nom]) => nom)

if (lancentPlaywright.length === 0) {
  echouer(
    `${PAQUET} : aucun script ne lance \`playwright test\`.\n` +
      `  → le motif de lecture ne correspond plus, cette garde ne garde` +
      ` donc plus rien.`,
  )
}

/*
  On cherche le nom entier, comme `commandes-annoncees.mjs` a appris à le
  faire : `includes('reel')` est vrai dans « réellement » et dans « Corée ».
*/
const nommeEntier = (texte, mot) =>
  new RegExp(`(^|[^\\p{L}\\d-])${mot}([^\\p{L}\\d-]|$)`, 'u').test(texte)

for (const [fichier, source] of [
  [README_PW, readFileSync(README_PW, 'utf8')],
  [REGLES_PW, readFileSync(REGLES_PW, 'utf8')],
]) {
  /*
    Le paragraphe qui parle de la variable, et lui seul : ailleurs dans le
    README, « e2e » apparaît pour d'autres raisons, et trouver le mot loin de
    la phrase ne prouverait pas qu'il y est annoncé.
  */
  const index = source.indexOf('PW_CHROMIUM_PATH')
  if (index === -1) {
    echouer(`${fichier} ne parle nulle part de PW_CHROMIUM_PATH.`)
  }
  const paragraphe = source.slice(index, index + 600)
  const absents = lancentPlaywright.filter((nom) => !nommeEntier(paragraphe, nom))
  if (absents.length > 0) {
    echouer(
      `${fichier} annonce PW_CHROMIUM_PATH sans nommer ${absents.join(', ')}.\n` +
        `  → ces scripts lancent pourtant \`playwright test\` et lisent la` +
        ` variable. Une phrase plus étroite que le besoin fait rougir une` +
        ` porte pour la mauvaise raison (issue #435, §4ter).`,
    )
  }
}

/*
  ──────────────────────────────────────────────────────────────────────────
  Les chronomètres, et le nom de fichier auquel toute la règle tenait (#475).

  `vitest.mutation.config.ts` écarte de la vague de mutation les tests qui
  assertent sur une horloge — ils n'ont rien à y apprendre, et ils la font
  tomber au galop d'essai. L'exclusion tient au suffixe `.perf.test.ts`.

  La règle vit donc à deux endroits qui peuvent diverger : une **convention
  de nommage**, mécanique, et un **fait sémantique** — ce test regarde-t-il
  une horloge ? Écrire `expect(duree).toBeLessThan(…)` dans un fichier au nom
  ordinaire suffisait à casser la vague, en silence : la mutation n'est pas
  une porte (§6bis), rien ne la relance, et personne ne voyait rien.

  Mesuré le 02/09 : `npm run mutation` ne démarrait plus, sur le budget de
  `routing.test.ts` — 881 ms pour tout le fichier au repos, 2 506 ms pour ce
  seul test avec les 99 fichiers du périmètre instrumentés, **à un seul
  processus**. C'est l'instrumentation qui coûte, pas la concurrence, et la
  prose de la configuration disait le contraire.

  Ce que ce script vérifie : tout fichier de `tests/unit/` qui asserte sur une
  durée écoulée s'appelle `*.perf.test.ts`, ou figure ci-dessous avec son
  motif. Ce qu'il ne prouve pas : que le budget soit le bon.
*/
const DOSSIER_UNITAIRE = 'tests/unit'

/**
 * Les assertions sur une durée écoulée qui ne sont **pas** des chronomètres.
 *
 * Une exemption se justifie, elle ne se constate pas : le §4bis dit ce que
 * devient une liste dont le pourquoi vit ailleurs.
 */
const CHRONOMETRES_ASSUMES = new Map([
  [
    'corridor.test.ts',
    "garde une terminaison, pas une performance : la boucle sans fin qu'il " +
      "attrape a tourné dix minutes avant d'être arrêtée, et ses deux autres " +
      'assertions portent sur un résultat qu’un mutant peut casser',
  ],
])

/*
  Une durée écoulée, et non n'importe quel `performance.now()` : un test peut
  lire l'horloge sans rien asserter dessus. Le motif cherche la soustraction
  de deux relevés, puis une assertion de comparaison sur ce qu'elle rend.
*/
const RELEVE = /performance\.now\(\)\s*-\s*/
const BORNE = /toBeLessThan(?:OrEqual)?\(/

/*
  Lecture **récursive**, comme le motif qu'elle garde.

  La première version lisait la racine seule alors que l'exclusion de
  `vitest.mutation.config.ts` s'écrit `tests/unit/(**)/*.perf.test.ts`. Il n'y a
  pas de sous-dossier aujourd'hui, donc rien ne manquait — mais un
  chronomètre rangé dans un sous-dossier serait passé sans un mot, et la
  vague aurait recassé en silence, exactement le défaut que cette garde
  existe pour fermer. Une garde plus étroite que sa règle est une garde qui
  attend son cas (#435, §4ter).
*/
const fichiersUnitaires = readdirSync(DOSSIER_UNITAIRE, {
  recursive: true,
}).filter((nom) => nom.endsWith('.test.ts'))
if (fichiersUnitaires.length < 50) {
  echouer(
    `Seulement ${String(fichiersUnitaires.length)} fichiers de test lus dans` +
      ` ${DOSSIER_UNITAIRE} : le motif de lecture ne correspond plus, et ce` +
      ` script ne garde donc plus rien.`,
  )
}

const chronometres = fichiersUnitaires.filter((nom) => {
  const source = readFileSync(`${DOSSIER_UNITAIRE}/${nom}`, 'utf8')
  return RELEVE.test(source) && BORNE.test(source)
})
if (chronometres.length === 0) {
  echouer(
    `Aucune assertion de durée trouvée dans ${DOSSIER_UNITAIRE} : le motif` +
      ` \`performance.now() - …\` suivi d'une borne ne correspond plus, et ce` +
      ` script ne garde donc plus rien.`,
  )
}

const nommesPerf = chronometres.filter((nom) => nom.endsWith('.perf.test.ts'))
const echappes = chronometres.filter(
  (nom) => !nom.endsWith('.perf.test.ts') && !CHRONOMETRES_ASSUMES.has(nom),
)
if (echappes.length > 0) {
  echouer(
    `Ces fichiers assertent sur une durée écoulée sans s'appeler` +
      ` \`*.perf.test.ts\` : ${echappes.join(', ')}.\n` +
      `  → \`vitest.mutation.config.ts\` les écarte par ce motif de nom. Sous` +
      ` ce nom-là ils entrent dans la vague de mutation, qui instrumente le` +
      ` code mesuré et fait exploser leur budget : \`npm run mutation\`` +
      ` refuse alors de démarrer, en silence (issue #475).\n` +
      `  → soit le fichier se renomme, soit son assertion garde autre chose` +
      ` qu'une performance, et il rejoint CHRONOMETRES_ASSUMES avec son motif.`,
  )
}

const exemptesDisparus = [...CHRONOMETRES_ASSUMES.keys()].filter(
  (nom) => !chronometres.includes(nom),
)
if (exemptesDisparus.length > 0) {
  echouer(
    `${exemptesDisparus.join(', ')} figure(nt) dans CHRONOMETRES_ASSUMES sans` +
      ` asserter de durée : l'exemption ne sert plus, et une exemption qui ne` +
      ` sert plus finit par en couvrir une autre.`,
  )
}

console.log(
  `Listes jumelles d'accord : ${String(plancherises.size)} genres plancherisés, ` +
    `tous mesurés ; ${String(Object.keys(hexParReseau).length)} couleurs de réseau, ` +
    `les trois listes d'accord ; ` +
    `${String(nommesParLaSkill.length)} personas de la skill, tous avec leur fiche ; ` +
    `${String(largeurs.length)} largeurs et ${String(etats.length)} états, annoncés tels quels ; ` +
    `${String(commandesDeLaPorte.length)} commandes de porte, toutes citées par le §6 ; ` +
    `${String(fichesDePersonas)} fiches de personas, annoncées telles quelles ; ` +
    `${String(lanceesParLeHook.length)} commandes du hook, toutes dans son en-tête ; ` +
    `${String(masquees.length)} listes de démonstration, masquées et relues d'accord ; ` +
    `le crédit des sources, recopié dans ${POURQUOI} et d'accord avec ${CREDITS} ; ` +
    `${String(poidsParZoom.size)} poids de tuile, tous retrouvés dans ${POIDS_DOC} ; ` +
    `${String(lancentPlaywright.length)} commandes Playwright, toutes annoncées avec PW_CHROMIUM_PATH ; ` +
    `${String(chronometres.length)} assertions de durée, dont ${String(nommesPerf.length)} nommées *.perf.test.ts ` +
    `(${String(CHRONOMETRES_ASSUMES.size)} exemption assumée).`,
)
