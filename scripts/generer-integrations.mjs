// Génère les fichiers d'intégration des autres assistants depuis la source
// unique `.claude/` (#590, mode de développement d'ISTQBFinder).
//
//   node scripts/generer-integrations.mjs              (ré)écrit les fichiers générés
//   node scripts/generer-integrations.mjs --verifier   code 1 si un fichier n'est pas à jour
//
// Source unique, à modifier : `.claude/agents/*.md` et `.claude/skills/*/` ;
// consignes communes dans `AGENTS.md`. Fichiers générés, à ne jamais modifier
// à la main :
//
// - GitHub Copilot : `.github/agents/*.agent.md`. Les skills n'ont pas
//   besoin de copie : Copilot lit `.claude/skills/` directement ;
// - Gemini CLI, qui ne lit pas `.claude/` : `.gemini/skills/*/` (copie),
//   `.gemini/agents/*.md` (sous-agents, `@ines`),
//   `.gemini/commands/*.toml` (`/ines <demande>`) et
//   `.gemini/settings.json` (contexte `AGENTS.md`, commandes autorisées reprises
//   de `.claude/settings.json`).
//
// Porté du générateur Python d'ISTQBFinder. La vérification tourne dans
// `npm run listes` (scripts/jumelles/16-integrations.mjs) : un agent modifié
// sans régénérer fait rougir la porte — une garde qu'il faut penser à lancer
// ne garde rien (CLAUDE.md §6quater).

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const AGENTS_CLAUDE = join(RACINE, '.claude', 'agents')
const SKILLS_CLAUDE = join(RACINE, '.claude', 'skills')
const REGLAGES_CLAUDE = join(RACINE, '.claude', 'settings.json')
const MARQUE = 'Fichier généré par scripts/generer-integrations.mjs'

// Outils Claude Code → alias Copilot, et → outils intégrés de Gemini CLI.
const OUTILS_COPILOT = { Bash: 'execute', Read: 'read', Grep: 'search', Glob: 'search', WebSearch: 'web', WebFetch: 'web' }
const OUTILS_GEMINI = {
  Bash: 'run_shell_command',
  Read: 'read_file',
  Grep: 'grep_search',
  Glob: 'glob',
  WebSearch: 'google_web_search',
  WebFetch: 'web_fetch',
}

const lire = (chemin) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n')

/** Sépare l'en-tête YAML minimal (« clé: valeur » et listes « - x ») du corps. */
export function lireEntete(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n')
  if (lignes[0] !== '---') throw new Error('en-tête YAML absent')
  const fin = lignes.indexOf('---', 1)
  const champs = {}
  let cle = null
  for (const ligne of lignes.slice(1, fin)) {
    if (ligne.startsWith('  - ') && cle) {
      if (!Array.isArray(champs[cle])) champs[cle] = []
      champs[cle].push(ligne.slice(4).trim())
    } else if (ligne.includes(':') && !ligne.startsWith(' ')) {
      const i = ligne.indexOf(':')
      cle = ligne.slice(0, i).trim()
      champs[cle] = ligne.slice(i + 1).trim().replace(/^"|"$/g, '')
    }
  }
  return { champs, corps: lignes.slice(fin + 1).join('\n').replace(/^\n+/, '') }
}

/** Outils autorisés, traduits ; un outil interdit ne passe jamais. */
function outils(champs, table) {
  const noms = String(champs.tools ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  const interdits = new Set(String(champs.disallowedTools ?? '').split(',').map((o) => o.trim()))
  const resultat = []
  for (const nom of noms) {
    const cible = table[nom]
    if (!interdits.has(nom) && cible && !resultat.includes(cible)) resultat.push(cible)
  }
  return resultat
}

function preambule(fichier, champs, assistant, outilLecture) {
  const lignes = [
    `<!-- ${MARQUE} depuis .claude/agents/${fichier} : ne pas modifier, relancer le script. -->`,
    '',
    `> **Version ${assistant}** de l'agent défini dans \`.claude/agents/${fichier}\` (source unique).`,
  ]
  for (const skill of champs.skills ?? []) {
    lignes.push(
      `> Ta méthode inclut le skill \`${skill}\` : **avant de commencer, lis en entier ` +
        `\`.claude/skills/${skill}/SKILL.md\`** ; cette lecture remplace le « déjà chargé » écrit plus bas.`,
    )
  }
  lignes.push(
    `> Outils : « \`Read\` » désigne ici \`${outilLecture}\` ; les commandes \`npm\`, \`npx\` et \`node\` ` +
      'passent par le terminal, lancées depuis la racine du dépôt.',
  )
  return `${lignes.join('\n')}\n\n`
}

function agentCopilot(fichier) {
  const { champs, corps } = lireEntete(lire(join(AGENTS_CLAUDE, fichier)))
  const entete = [
    '---',
    `name: ${champs.name}`,
    `description: ${JSON.stringify(champs.description)}`,
    `tools: ${JSON.stringify(outils(champs, OUTILS_COPILOT))}`,
    '---',
    '',
  ]
  return entete.join('\n') + preambule(fichier, champs, 'GitHub Copilot', 'read') + corps
}

function agentGemini(fichier) {
  const { champs, corps } = lireEntete(lire(join(AGENTS_CLAUDE, fichier)))
  const entete = [
    '---',
    `name: ${champs.name}`,
    `description: ${JSON.stringify(champs.description)}`,
    'kind: local',
    'tools:',
    ...outils(champs, OUTILS_GEMINI).map((o) => `  - ${o}`),
    '---',
    '',
  ]
  return entete.join('\n') + preambule(fichier, champs, 'Gemini CLI', 'read_file') + corps
}

/** Chaîne TOML multiligne « basique » (échappe \ et "). */
const chaineToml = (texte) => `"""\n${texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"""`

/** `/ines <demande>` : le prompt de l'agent joué dans la conversation principale. */
function commandeGemini(fichier) {
  const { champs, corps } = lireEntete(lire(join(AGENTS_CLAUDE, fichier)))
  const nom = champs.name
  const prompt =
    preambule(fichier, champs, `Gemini CLI (commande /${nom})`, 'read_file').split('\n').slice(2).join('\n') +
    `> Ici tu réponds directement dans la conversation (pas en sous-agent) : tu peux poser toi-même ` +
    `les questions de cadrage. Pour une délégation en sous-agent : \`@${nom}\`.\n\n` +
    `${corps.replace(/\n+$/, '')}\n\n## Demande de l'utilisateur\n\n{{args}}\n`
  const description = `${champs.description.split('. ')[0].replace(/\.$/, '')}.`
  return (
    `# ${MARQUE} depuis .claude/agents/${fichier} : ne pas modifier, relancer le script.\n` +
    `description = ${JSON.stringify(description)}\n` +
    `prompt = ${chaineToml(prompt)}\n`
  )
}

function fichiersDe(dossier) {
  const tous = []
  for (const nom of readdirSync(dossier).sort()) {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) tous.push(...fichiersDe(chemin))
    else tous.push(chemin)
  }
  return tous
}

/** Copie d'un skill, en-tête réduit à name/description, arborescence conservée. */
function skillGemini(nom) {
  const dossier = join(SKILLS_CLAUDE, nom)
  const fichiers = {}
  for (const f of fichiersDe(dossier)) {
    const rel = relative(dossier, f).split('\\').join('/')
    const source = `.claude/skills/${nom}/${rel}`
    let texte = lire(f)
    const marque = `<!-- ${MARQUE} depuis ${source} : ne pas modifier, relancer le script. -->\n`
    if (rel === 'SKILL.md') {
      const { champs, corps } = lireEntete(texte)
      texte = `---\nname: ${champs.name}\ndescription: ${JSON.stringify(champs.description)}\n---\n${marque}\n${corps}`
    } else if (f.endsWith('.md')) {
      texte = `${marque}\n${texte}`
    }
    fichiers[`.gemini/skills/${nom}/${rel}`] = texte
  }
  return fichiers
}

/** Commandes autorisées de `.claude/settings.json`, au format Gemini. */
function reglagesGemini() {
  const allow = JSON.parse(readFileSync(REGLAGES_CLAUDE, 'utf8')).permissions?.allow ?? []
  const commandes = allow
    .filter((r) => r.startsWith('Bash(') && r.endsWith(')'))
    .map((r) => `run_shell_command(${r.slice(5, -1).replace(/(:\*|\*)$/, '').trim()})`)
  return `${JSON.stringify({ context: { fileName: ['AGENTS.md'] }, tools: { allowed: commandes } }, null, 2)}\n`
}

/** Chemin relatif (POSIX) → contenu attendu de chaque fichier généré. */
export function fichiersAttendus() {
  const attendus = {}
  for (const fichier of readdirSync(AGENTS_CLAUDE).filter((f) => f.endsWith('.md')).sort()) {
    const nom = fichier.replace(/\.md$/, '')
    attendus[`.github/agents/${nom}.agent.md`] = agentCopilot(fichier)
    attendus[`.gemini/agents/${nom}.md`] = agentGemini(fichier)
    attendus[`.gemini/commands/${nom}.toml`] = commandeGemini(fichier)
  }
  for (const nom of readdirSync(SKILLS_CLAUDE).sort()) {
    if (existsSync(join(SKILLS_CLAUDE, nom, 'SKILL.md'))) Object.assign(attendus, skillGemini(nom))
  }
  attendus['.gemini/settings.json'] = reglagesGemini()
  return attendus
}

/** Fichiers générés autrefois (marqués) dont la source a disparu. */
function orphelins(attendus) {
  const trouves = []
  for (const dossier of [join(RACINE, '.github', 'agents'), join(RACINE, '.gemini')]) {
    if (!existsSync(dossier)) continue
    for (const f of fichiersDe(dossier)) {
      const rel = relative(RACINE, f).split('\\').join('/')
      if (!(rel in attendus) && lire(f).includes(MARQUE)) trouves.push(rel)
    }
  }
  return trouves
}

/** Fichiers absents, périmés ou orphelins (liste vide = tout est à jour). */
export function ecarts() {
  const attendus = fichiersAttendus()
  const resultat = []
  for (const [rel, contenu] of Object.entries(attendus)) {
    const f = join(RACINE, rel)
    if (!existsSync(f)) resultat.push(`absent : ${rel}`)
    else if (lire(f) !== contenu) resultat.push(`périmé : ${rel}`)
  }
  return [...resultat, ...orphelins(attendus).map((rel) => `orphelin : ${rel}`)]
}

function generer() {
  const attendus = fichiersAttendus()
  const ecrits = []
  for (const [rel, contenu] of Object.entries(attendus)) {
    const f = join(RACINE, rel)
    if (!existsSync(f) || lire(f) !== contenu) {
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, contenu, 'utf8')
      ecrits.push(rel)
    }
  }
  for (const rel of orphelins(attendus)) {
    // `unlinkSync` et non `rmSync`, qui ne supprime rien sous un chemin
    // accentué, sans erreur (#612) : l'orphelin était annoncé « supprimé ».
    unlinkSync(join(RACINE, rel))
    ecrits.push(`${rel} (supprimé)`)
  }
  return ecrits
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--verifier')) {
    const problemes = ecarts()
    for (const p of problemes) console.log(p)
    if (problemes.length > 0) {
      console.log('Intégrations à régénérer : node scripts/generer-integrations.mjs')
      process.exit(1)
    }
    console.log('Intégrations à jour.')
  } else {
    const ecrits = generer()
    console.log(ecrits.length > 0 ? ecrits.join('\n') : 'Rien à régénérer : intégrations à jour.')
  }
}
