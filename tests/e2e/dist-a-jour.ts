import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Refuse de démarrer la suite Playwright sur un `dist/` plus vieux que les
 * sources.
 *
 * ## Pourquoi ceci existe alors qu'un hook le fait déjà
 *
 * `.claude/hooks/dist-a-jour.sh` pose la même question, et il l'a bien posée
 * pendant deux jours. Mais un hook `PreToolUse` juge la commande **avant**
 * qu'elle s'exécute, et une seule commande peut faire les deux :
 *
 *     python3 - <<'PY' ...modifie les sources... PY
 *     npm run build && npx playwright test
 *
 * Au moment où le hook regarde, `dist/` est encore à jour — les sources ne
 * seront modifiées qu'une milliseconde plus tard, par la commande qu'il
 * vient d'autoriser. Si le build échoue ensuite, Playwright teste la version
 * d'avant et passe au vert.
 *
 * C'est arrivé le 25/08 pendant la vérification du §1 du sprint 2 : deux
 * défauts délibérément réinjectés, `tsc -b` en échec sur deux imports
 * devenus inutiles, `dist/` inchangé, et **trois tests verts qui prouvaient
 * exactement le contraire de ce qu'on leur demandait**. Le hook n'a rien pu
 * faire : il avait déjà répondu.
 *
 * Ce contrôle-ci s'exécute dans le processus de Playwright, au moment du
 * démarrage. Il n'y a plus d'intervalle entre la vérification et l'usage —
 * c'est le seul endroit d'où l'on ne peut pas le contourner par accident.
 *
 * Le hook garde sa raison d'être : il refuse plus tôt, avec un message plus
 * utile, et évite d'attendre le démarrage du serveur pour l'apprendre. Les
 * deux ne font pas double emploi, ils couvrent deux instants différents.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne construit pas à votre place. Construire en silence masquerait un
 * build cassé derrière un test lent — le même défaut, déplacé (c'est déjà
 * écrit dans le hook, et ça reste vrai ici).
 */

/** Les racines dont une modification rend `dist/` périmé. */
const SOURCES = [
  'src',
  'public',
  'index.html',
  'vite.config.ts',
  'package.json',
]

/** L'horodatage du fichier le plus récent d'une arborescence. */
function plusRecent(chemin: string): number {
  if (!existsSync(chemin)) return 0
  const infos = statSync(chemin)
  if (infos.isFile()) return infos.mtimeMs
  let max = 0
  for (const entree of readdirSync(chemin)) {
    max = Math.max(max, plusRecent(join(chemin, entree)))
  }
  return max
}

export default function verifierDist(): void {
  if (!existsSync('dist')) {
    throw new Error(
      'Playwright sert dist/, qui n’existe pas. Lancer `npm run build` — et lire sa sortie.',
    )
  }
  const construit = plusRecent('dist')
  if (construit === 0) {
    throw new Error('dist/ est vide. Lancer `npm run build`.')
  }
  const coupables = SOURCES.filter((s) => plusRecent(s) > construit)
  if (coupables.length > 0) {
    throw new Error(
      `dist/ est plus vieux que les sources : Playwright testerait une version périmée, ` +
        `et passerait au vert en prouvant le contraire de ce qu’on lui demande ` +
        `(CLAUDE.md §6 et §6quater). Modifiés depuis le dernier build : ` +
        `${coupables.join(', ')}. Lancer \`npm run build\` et vérifier « ✓ built ».`,
    )
  }
}
