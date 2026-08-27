/**
 * Le README annonce-t-il tous les filtres qui existent ?
 *
 * Le 25/08, non : le panneau « Trouver une sortie » en comptait sept, le
 * README en énumérait cinq. Le **sol** et l'**eau** y étaient depuis deux
 * jours, et personne ne l'aurait jamais lu là.
 *
 * C'est le mode d'échec du §3, et exactement le fichier qu'il nomme :
 * « l'issue #168 en a corrigé trois et oublié le README — la première chose
 * que lit quelqu'un qui arrive sur le dépôt. Aucune revue de diff ne pouvait
 * l'attraper : le README n'était dans aucun diff. » Trois sprints plus tard,
 * le même trou.
 *
 * ## Ce que ce script garde, et ce qu'il ne garde pas
 *
 * Il garde **l'existence** : chaque commande du panneau a un mot qui la
 * désigne dans le README. Il ne garde pas que la phrase soit juste — ça, ça
 * se relit, et le §2 interdit de prétendre mesurer ce qui se décide.
 *
 * La table ci-dessous est elle-même une jumelle, et c'est assumé : sa
 * propriété utile est qu'un `data-testid` **inconnu la fait échouer**. Un
 * filtre neuf ne peut donc pas passer sans que quelqu'un décide du mot qui
 * l'annonce.
 */
import { readFileSync } from 'node:fs'

const PANNEAU = 'src/components/ItineraryList.tsx'
const README = 'README.md'

/** Le mot que le README doit employer pour chaque commande du panneau. */
const MOT_ATTENDU = {
  'list-length': 'longueur',
  'list-duration': 'durée',
  'list-gain': 'dénivelé',
  'list-shape': 'forme',
  'list-sol': 'sol',
  'list-nearby': 'proximité',
  'list-eau': 'eau',
  'list-charger-pois': 'eau',
  'list-question': 'phrase',
  // Le repli des grands itinéraires (#322) : ce n'est pas un critère qu'on
  // choisit mais un défaut qu'on subit, donc c'est justement celui que le
  // README doit annoncer — quelqu'un qui arrive sur le dépôt doit apprendre
  // qu'il ne voit pas tout.
  'list-masques': 'masqués',
}

/*
  Hors du panneau « Trouver une sortie » : le tri et le filtre par nom vivent
  au-dessus, dans la liste elle-même, et le README les décrit ailleurs.
*/
const HORS_PANNEAU = new Set([
  'list-filter', // filtre par nom, au-dessus du panneau
  'list-sort', // tri, au-dessus du panneau
  'list-question-ok', // le bouton de la phrase, pas un critère
  'list-reset', // remet les filtres à zéro, n'en est pas un
  'list-empty', // l'état vide, quand aucun itinéraire ne passe
])

const source = readFileSync(PANNEAU, 'utf8')
const trouves = [
  ...new Set(
    [...source.matchAll(/data-testid="(list-[a-z-]+)"/g)].map((m) => m[1]),
  ),
].filter((id) => !HORS_PANNEAU.has(id))

const inconnus = trouves.filter((id) => !(id in MOT_ATTENDU))
if (inconnus.length > 0) {
  console.error(
    `Commande(s) sans mot décidé : ${inconnus.join(', ')}\n` +
      `Ajouter chacune à MOT_ATTENDU dans ${import.meta.url.split('/').pop()}, ` +
      `avec le mot par lequel le README l'annonce.`,
  )
  process.exit(1)
}

const readme = readFileSync(README, 'utf8').toLowerCase()

/*
  Mot entier, et non sous-chaîne.

  La première écriture cherchait `readme.includes(mot)` : « eau » se trouvait
  dans « réseau » et « niveau », « sol » dans « console » et « absolument ».
  Le script rendait donc « toutes nommées » sur un README où j'avais retiré
  le sol exprès — un garde-fou vert pour rien, ce que le §1 appelle un test
  qui ne peut pas échouer.

  `\p{L}` plutôt que `\w` : « durée », « dénivelé » et « proximité » ont
  des accents, et `\b` les traite comme des frontières de mot.
*/
function nommeDansLeReadme(mot) {
  return new RegExp(`(?<![\\p{L}])${mot}(?![\\p{L}])`, 'u').test(readme)
}

const muets = trouves.filter((id) => !nommeDansLeReadme(MOT_ATTENDU[id]))

if (muets.length > 0) {
  console.error(
    `Le README n'annonce pas : ${muets.map((id) => `${id} (« ${MOT_ATTENDU[id]} »)`).join(', ')}`,
  )
  process.exit(1)
}

console.log(
  `Filtres annoncés : ${String(trouves.length)} commandes, toutes nommées dans le README.`,
)
