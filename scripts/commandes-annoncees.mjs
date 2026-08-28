/**
 * Le README annonce-t-il toutes les commandes qui existent ?
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
 *
 * ## Deux surfaces, un seul script (28/08)
 *
 * Le 28/08, le trou s'est rouvert ailleurs : la feuille d'impression, livrée
 * le matin même, n'était annoncée nulle part — ni bouton, ni README, ni PRD.
 * `grep -i imprim` ne rendait que le CSS (issue #369).
 *
 * Ce fichier ne gardait que le panneau « Trouver une sortie ». Il garde
 * maintenant aussi **les boutons de la fiche détail**, et il a été renommé
 * pour cela : il ne parle plus de filtres.
 *
 * Un second script aurait posé la même question dans deux fichiers — c'est
 * précisément le §4ter, et c'est ce que quatre instances de #367 viennent de
 * coûter. Une question, un endroit.
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

/*
  Seconde surface : les boutons de la fiche détail.

  Ici on ne peut pas se contenter des `data-testid` du fichier : il y en a
  vingt-quatre, et la plupart désignent un affichage — l'écart, la pente
  maximale, la qualité des données. Ce qu'on veut sont les **commandes**,
  c'est-à-dire ce qui est rendu comme un `<button>`.

  La lecture remonte depuis chaque `data-testid` jusqu'à la balise qui le
  porte, plutôt que de descendre depuis `<button`. Un `onClick={() => …}`
  contient une flèche, donc un `>` : toute expression du genre `<button[^>]*`
  s'arrête au milieu de la fonction et manque l'attribut. C'est le genre de
  motif qui paraît juste et qui garde la moitié de ce qu'on croit.
*/
const FICHE = 'src/components/ItineraryDetail.tsx'

const sourceFiche = readFileSync(FICHE, 'utf8')
const boutonsDeLaFiche = [
  ...new Set(
    [...sourceFiche.matchAll(/data-testid="([a-z0-9-]+)"/g)]
      .filter((m) => {
        const avant = sourceFiche.slice(0, m.index)
        const ouverture = avant.lastIndexOf('<')
        return /^button\b/.test(avant.slice(ouverture + 1))
      })
      .map((m) => m[1]),
  ),
]

if (boutonsDeLaFiche.length === 0) {
  console.error(
    `Aucun bouton lu dans ${FICHE} : le motif de lecture ne correspond plus,` +
      ` et ce contrôle ne garde donc plus rien.`,
  )
  process.exit(1)
}

/**
 * Le mot que le README doit employer pour chaque commande de la fiche.
 *
 * `null` = commande qui n'a pas à être annoncée. Fermer une fiche ou déplier
 * une liste sont des gestes d'interface, pas des fonctions qu'on vient
 * chercher — les annoncer diluerait le README au lieu de l'enrichir. Le
 * motif est celui d'`ABSENTS_ASSUMES` dans `scripts/chemins-cites.mjs` :
 * l'exemption est écrite, donc relisible.
 */
const MOT_ATTENDU_FICHE = {
  'itinerary-detail-close': null,
  'poi-deplier': null,
  'detail-3d-toggle': 'incliner',
  'itinerary-detail-export': 'exporte',
  'itinerary-detail-imprimer': 'imprime',
  'etapes-export': 'étapes',
}

const inconnusFiche = boutonsDeLaFiche.filter(
  (id) => !(id in MOT_ATTENDU_FICHE),
)
if (inconnusFiche.length > 0) {
  console.error(
    `Bouton(s) de la fiche sans mot décidé : ${inconnusFiche.join(', ')}\n` +
      `Ajouter chacun à MOT_ATTENDU_FICHE, avec le mot par lequel le README` +
      ` l'annonce — ou \`null\` si c'est un geste d'interface qui n'a pas à` +
      ` être annoncé.`,
  )
  process.exit(1)
}

const muetsFiche = boutonsDeLaFiche.filter(
  (id) => MOT_ATTENDU_FICHE[id] !== null && !nommeDansLeReadme(MOT_ATTENDU_FICHE[id]),
)
if (muetsFiche.length > 0) {
  console.error(
    `Le README n'annonce pas : ` +
      muetsFiche
        .map((id) => `${id} (« ${MOT_ATTENDU_FICHE[id]} »)`)
        .join(', '),
  )
  process.exit(1)
}

const annoncesFiche = boutonsDeLaFiche.filter(
  (id) => MOT_ATTENDU_FICHE[id] !== null,
).length

console.log(
  `Commandes annoncées : ${String(trouves.length)} filtres et ` +
    `${String(annoncesFiche)} boutons de fiche, tous nommés dans le README ` +
    `(${String(boutonsDeLaFiche.length - annoncesFiche)} gestes d'interface exemptés).`,
)
