/**
 * Lit les survivants de la dernière vague de mutation — et refuse un
 * rapport périmé.
 *
 * ## Le raté, daté
 *
 * Le 18/10 au soir, une vague sur `core/matching.ts` a échoué dès son galop
 * d'essai : un fichier de test ne se chargeait plus. Stryker est sorti en
 * erreur sans écrire de rapport, et le script qui suivait a relu celui de la
 * vague d'avant. Il a rendu 91 survivants — les mêmes, au mutant près, que
 * l'heure précédente — et je les ai lus comme un résultat.
 *
 * Ce qui l'a trahi, c'est un détail : les numéros de ligne n'avaient pas
 * bougé, alors que six lignes venaient d'être ajoutées au fichier. Je l'ai vu
 * par chance. Le §6quater de CLAUDE.md dit ce que vaut un contrôle qu'il faut
 * penser à faire : rien.
 *
 * ## Ce qu'il vérifie
 *
 * Qu'aucun fichier de `src/` ni de `tests/unit/` n'est plus récent que le
 * rapport. Si c'est le cas, le rapport ne décrit pas l'arbre qu'on a sous
 * les yeux — soit la vague a échoué, soit on a modifié le code depuis — et
 * il est refusé, en nommant le fichier qui l'a rendu périmé.
 *
 * Il ne vérifie pas que la vague a réussi : il vérifie que ce qu'on lit est
 * encore vrai. C'est la seule des deux questions qu'on puisse poser après
 * coup.
 *
 * Ses deux limites, dites plutôt que tues :
 *
 * - il compare des dates, pas des contenus. Un fichier restauré à
 *   l'identique après une injection (`cp sauvegarde fichier`) est plus récent
 *   que le rapport, qui est refusé alors qu'il était juste. Relancer coûte
 *   une vague : c'est le bon sens de l'erreur ;
 * - il ne sait pas quels fichiers la dernière vague visait. Si une vague sur
 *   `fit.ts` échoue alors que rien n'a changé depuis une vague réussie sur
 *   `geojson.ts`, le rapport est à jour au sens des dates, et faux quand
 *   même. C'est pourquoi il affiche sa date et les fichiers qu'il couvre en
 *   tête de sortie : ce qu'on lit doit être ce qu'on a demandé.
 *
 * ## Usage
 *
 *     npx stryker run --mutate src/core/fit.ts
 *     npm run survivants
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RAPPORT = 'reports/mutation.json'
const SURVEILLES = ['src', 'tests/unit']

function echouer(message) {
  console.error(message)
  process.exit(1)
}

function* fichiers(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) yield* fichiers(chemin)
    else yield chemin
  }
}

if (!existsSync(RAPPORT)) {
  echouer(`Aucun rapport (${RAPPORT}) : lancer une vague d'abord.`)
}

const dateDuRapport = statSync(RAPPORT).mtimeMs
let plusRecent = null
for (const dossier of SURVEILLES) {
  for (const chemin of fichiers(dossier)) {
    const date = statSync(chemin).mtimeMs
    if (date > dateDuRapport && (plusRecent === null || date > plusRecent.date)) {
      plusRecent = { chemin, date }
    }
  }
}

if (plusRecent) {
  echouer(
    `Rapport périmé : ${plusRecent.chemin} a changé après la dernière vague.\n\n` +
      'Soit la vague a échoué — et ce rapport est celui de la précédente —,\n' +
      'soit le code a bougé depuis. Dans les deux cas, ce qu’il dit ne décrit\n' +
      'pas l’arbre actuel. Relancer la vague, puis relire.',
  )
}

const rapport = JSON.parse(readFileSync(RAPPORT, 'utf8'))
console.log(
  `Rapport du ${new Date(dateDuRapport).toISOString()}, sur : ${Object.keys(rapport.files).join(', ')}\n`,
)
for (const [fichier, { source, mutants }] of Object.entries(rapport.files)) {
  const lignes = source.split('\n')
  const parStatut = {}
  for (const m of mutants) parStatut[m.status] = (parStatut[m.status] ?? 0) + 1
  console.log(`== ${fichier} ${JSON.stringify(parStatut)}`)
  for (const m of mutants) {
    if (m.status !== 'Survived' && m.status !== 'NoCoverage') continue
    const ligne = m.location.start.line
    const remplacement = JSON.stringify(m.replacement ?? '').slice(0, 45)
    console.log(
      `   ${m.status.slice(0, 4)} ${String(ligne)} ${m.mutatorName.slice(0, 14)} ${remplacement} | ${(lignes[ligne - 1] ?? '').trim().slice(0, 70)}`,
    )
  }
}
