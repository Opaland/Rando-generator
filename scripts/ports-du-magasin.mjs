/**
 * Un port de dépendance né mort ne se signale pas tout seul (#489).
 *
 * ## Le raté, daté
 *
 * `appStore.ts` câble sept tranches (#155) en leur passant des lambdas de
 * dépendance. Chaque tranche est éprouvée contre des doubles, et chacune
 * l'est bien ; mais les lambdas elles-mêmes ne sont éprouvées d'aucun côté,
 * et `tests/unit/suppressionDuStore.test.ts` affirmait qu'une d'elles était
 * « bien appelée » en assertant sur un double.
 *
 * Le 03/09, cinq de ces ports n'étaient exécutés par aucun des 2 299 tests —
 * dont `fermerLaFicheSi`, qui ferme la fiche d'un itinéraire supprimé, et
 * `enregistrerLeTrace`, qui écrit un tracé dessiné en base. Ils ont été
 * trouvés parce qu'un recensement a été lancé à la main, un matin. Personne
 * ne le relancera : le §6quater est formel, s'il faut le lire il ne garde
 * rien.
 *
 * ## Ce qu'il vérifie, et rien d'autre
 *
 * Que chaque port passé à une tranche désigne une fonction que la suite
 * unitaire **a appelée au moins une fois**. C'est l'exécution, jamais la
 * justesse : un port appelé par un test creux passe ici, et c'est au §1 de
 * s'en occuper.
 *
 * La réponse vient de la carte des fonctions du rapport de couverture v8
 * (`fnMap` + `f`), et surtout pas de la carte des instructions : la ligne
 * d'une propriété s'exécute à la construction du magasin, donc une lambda
 * jamais appelée y paraît couverte. Une première version du recensement s'y
 * est trompée, et ne retrouvait même pas les deux ports qu'une injection
 * avait déjà prouvés morts.
 *
 * ## Ce qui doit échouer bruyamment, et pourquoi
 *
 * La deuxième version s'est trompée autrement : son motif ne reconnaissait
 * que les formes `nom :` et `nom(`, et **passait en silence** sur les dix-huit
 * clés en raccourci. Elle a publié « 27 ports, 0 jamais appelé » là où il y
 * en a 45 — un chiffre faux, et une garantie donnée sur les deux cinquièmes
 * du sujet.
 *
 * D'où la règle qui compte ici : **tout ce que ce script ne sait pas lire
 * le fait échouer.** Un bloc de tranche introuvable, un compte de ports
 * invraisemblable, un port qu'on ne sait pas relier à une fonction, deux
 * fonctions du même nom : chacun rend un échec nommé, jamais un silence.
 *
 * ## Les exemptions, et pourquoi elles ne peuvent pas pourrir
 *
 * `set` est le paramètre du créateur Zustand, pas une fonction à nous :
 * aucune carte d'appels ne le porte. Il est donc exempté — et, comme dans
 * `scripts/chemins-cites.mjs`, **une exemption qui ne sert plus fait échouer
 * le script** plutôt que de dormir. C'est déjà arrivé pendant l'écriture :
 * `get` y figurait, il n'est port d'aucune tranche, et la garde l'a dit.
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MAGASIN = 'src/store/appStore.ts'
const RAPPORT = 'coverage/coverage-final.json'
const DOSSIER_MESURE = 'src/store'
const DOSSIER_TESTS = 'tests/unit'

/**
 * Les ports qu'aucune carte d'appels ne peut porter, avec leur motif.
 *
 * Une entrée qui n'est plus citée par `appStore.ts` fait échouer le script :
 * une exemption qui ne sert plus est un bandeau sur les yeux, pas une garde.
 */
const HORS_CARTE_ASSUMES = new Map([
  [
    'set',
    "le poseur d'état de Zustand, passé au créateur du magasin : c'est un" +
      ' paramètre, pas une fonction du dépôt, et aucune carte ne le porte',
  ],
])

function echouer(message) {
  console.error(message)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 1. Le rapport lu doit être plus récent que ce qu'il prétend mesurer.
 *
 * Sans cela ce script serait exactement le garde-fou que le §6quater
 * décrit : un contrôle qui répond juste sur un état périmé. `dist/` a
 * déjà joué ce tour trois fois en une nuit.
 * ------------------------------------------------------------------ */
if (!existsSync(RAPPORT)) {
  echouer(
    `${RAPPORT} est absent : lancer \`npm run coverage\` avant ce contrôle.`,
  )
}

function fichiersSous(dossier, suffixe) {
  return readdirSync(dossier, { recursive: true })
    .map((nom) => join(dossier, nom))
    .filter((chemin) => chemin.endsWith(suffixe) && statSync(chemin).isFile())
}

const sources = [
  ...fichiersSous(DOSSIER_MESURE, '.ts'),
  ...fichiersSous(DOSSIER_TESTS, '.test.ts'),
]
if (sources.length === 0) {
  echouer(
    `Aucune source lue sous ${DOSSIER_MESURE} ni ${DOSSIER_TESTS} : le motif` +
      ` de lecture ne correspond plus, et le contrôle de fraîcheur ne garde` +
      ` donc plus rien.`,
  )
}
const ageDuRapport = statSync(RAPPORT).mtimeMs
const plusRecente = sources
  .map((chemin) => ({ chemin, quand: statSync(chemin).mtimeMs }))
  .sort((a, b) => b.quand - a.quand)[0]
if (plusRecente.quand > ageDuRapport) {
  echouer(
    `${RAPPORT} est plus vieux que ${plusRecente.chemin} : il mesure un état\n` +
      "que le dépôt n'a plus. Relancer `npm run coverage`.\n" +
      '\nUn contrôle qui répond juste sur un rapport périmé est le garde-fou\n' +
      'que le §6quater décrit — celui qui ne garde rien.',
  )
}

/* ------------------------------------------------------------------ *
 * 2. La carte d'appels, indexée par fichier puis par décalage.
 * ------------------------------------------------------------------ */
const brut = JSON.parse(readFileSync(RAPPORT, 'utf8'))
const parFichier = new Map()
for (const [absolu, donnees] of Object.entries(brut)) {
  const relatif = absolu.replace(`${process.cwd()}/`, '')
  parFichier.set(relatif, donnees)
}

const mesure = parFichier.get(MAGASIN)
if (!mesure) {
  echouer(
    `${MAGASIN} n'apparaît pas dans ${RAPPORT} : la couverture ne mesure pas\n` +
      "le magasin, et ce contrôle ne garde donc rien. Vérifier `include` dans\n" +
      '`vite.config.ts`.',
  )
}

/** Convertit une position (ligne, colonne) de v8 en décalage de caractère. */
function tableDesLignes(texte) {
  const departs = [0]
  for (let i = 0; i < texte.length; i += 1) {
    if (texte[i] === '\n') departs.push(i + 1)
  }
  return departs
}

/** Les fonctions d'un fichier mesuré : décalage de déclaration, nom, appels. */
function fonctionsDe(chemin) {
  const donnees = parFichier.get(chemin)
  if (!donnees) return []
  const departs = tableDesLignes(readFileSync(chemin, 'utf8'))
  return Object.entries(donnees.fnMap).map(([cle, valeur]) => ({
    nom: valeur.name,
    ou: departs[valeur.decl.start.line - 1] + valeur.decl.start.column,
    ligne: valeur.decl.start.line,
    appels: donnees.f[cle] ?? 0,
    fichier: chemin,
  }))
}

const source = readFileSync(MAGASIN, 'utf8')
const fonctionsDuMagasin = fonctionsDe(MAGASIN).sort((a, b) => a.ou - b.ou)

/* ------------------------------------------------------------------ *
 * 3. Lire les blocs de tranches, commentaires masqués.
 *
 * Le masque remplace chaque caractère de commentaire ou de chaîne par une
 * espace, en gardant les décalages : une virgule prise dans un commentaire
 * ne coupe donc plus un port en deux. C'est exactement la faute de la
 * deuxième version.
 * ------------------------------------------------------------------ */
function masquer(texte) {
  const sortie = texte.split('')
  let i = 0
  const effacer = (fin) => {
    for (; i < fin && i < texte.length; i += 1) {
      if (texte[i] !== '\n') sortie[i] = ' '
    }
  }
  while (i < texte.length) {
    const deux = texte.slice(i, i + 2)
    if (deux === '//') {
      const fin = texte.indexOf('\n', i)
      effacer(fin === -1 ? texte.length : fin)
    } else if (deux === '/*') {
      const fin = texte.indexOf('*/', i + 2)
      effacer(fin === -1 ? texte.length : fin + 2)
    } else if (texte[i] === "'" || texte[i] === '"' || texte[i] === '`') {
      const guillemet = texte[i]
      let j = i + 1
      while (j < texte.length && texte[j] !== guillemet) {
        j += texte[j] === '\\' ? 2 : 1
      }
      i += 1
      effacer(j)
      i = j + 1
    } else {
      i += 1
    }
  }
  return sortie.join('')
}

const masque = masquer(source)

const blocs = []
for (const trouve of masque.matchAll(/\.\.\.(tranche\w+)\(\{/g)) {
  const ouvrante = trouve.index + trouve[0].length - 1
  let profondeur = 0
  let j = ouvrante
  for (; j < masque.length; j += 1) {
    if (masque[j] === '{') profondeur += 1
    else if (masque[j] === '}') {
      profondeur -= 1
      if (profondeur === 0) break
    }
  }
  blocs.push({ tranche: trouve[1], debut: ouvrante + 1, fin: j })
}

if (blocs.length === 0) {
  echouer(
    `Aucun bloc \`...tranche…({\` lu dans ${MAGASIN} : le motif de lecture ne\n` +
      'correspond plus, et ce contrôle ne garde donc plus rien.',
  )
}

/** Découpe le corps d'un objet littéral en ses entrées de premier niveau. */
function entreesDe(debut, fin) {
  const entrees = []
  let profondeur = 0
  let depart = debut
  for (let i = debut; i < fin; i += 1) {
    const c = masque[i]
    if (c === '(' || c === '{' || c === '[') profondeur += 1
    else if (c === ')' || c === '}' || c === ']') profondeur -= 1
    else if (c === ',' && profondeur === 0) {
      entrees.push([depart, i])
      depart = i + 1
    }
  }
  entrees.push([depart, fin])
  return entrees.filter(([a, b]) => masque.slice(a, b).trim() !== '')
}

const ports = []
for (const bloc of blocs) {
  for (const [debut, fin] of entreesDe(bloc.debut, bloc.fin)) {
    const texte = masque.slice(debut, fin)
    /*
      Ancré : sans le `^`, `...ETALEMENT` rendait « un port nommé ETALEMENT »
      au lieu d'un échec. Une entrée qu'on lit de travers est pire qu'une
      entrée qu'on ne lit pas — c'est le §1bis, appliqué à l'instrument.
    */
    const cle = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*(:|\(|$)/.exec(
      texte.trim(),
    )
    if (!cle) {
      echouer(
        `Entrée illisible dans \`${bloc.tranche}\` de ${MAGASIN} :\n` +
          `  ${source.slice(debut, fin).trim().slice(0, 80)}\n` +
          "\nCe script refuse de sauter ce qu'il ne sait pas lire : c'est le\n" +
          "silence sur dix-huit ports qui a fait publier un compte faux.",
      )
    }
    const apresLaCle = texte.indexOf(cle[1]) + cle[1].length
    ports.push({
      tranche: bloc.tranche,
      nom: cle[1],
      raccourci: cle[2] === '',
      valeur: texte.slice(apresLaCle).replace(/^\s*:\s*/, '').trim(),
      debut,
      fin,
    })
  }
}

/*
  Un plancher, et il est mesuré : 45 ports le 03/09, répartis sur sept
  tranches. Un compte qui s'effondre dit que le découpage a cessé de
  fonctionner, pas que le magasin a maigri.
*/
const PLANCHER = 30
if (ports.length < PLANCHER) {
  echouer(
    `Seulement ${String(ports.length)} port(s) lu(s) dans ${MAGASIN}, pour\n` +
      `${String(blocs.length)} tranche(s) — il y en avait 45 le 03/09.\n` +
      'Le découpage ne correspond plus, et ce contrôle ne garde donc plus rien.',
  )
}

/* ------------------------------------------------------------------ *
 * 4. Relier chaque port à une fonction, ou échouer en le nommant.
 * ------------------------------------------------------------------ */
/*
  Tous les fichiers mesurés, et pas seulement ceux du magasin : un port peut
  désigner une fonction qui vit ailleurs — `telecharger: downloadBlob` vient
  de `src/lib/download.ts`. Restreindre la recherche au dossier du magasin
  rendait ce port introuvable, et c'est la garde elle-même qui l'a dit.
*/
const fichiersMesures = [...parFichier.keys()].filter((c) =>
  c.startsWith('src/'),
)
const fonctionsParNom = new Map()
for (const chemin of fichiersMesures) {
  for (const fonction of fonctionsDe(chemin)) {
    if (!fonction.nom || fonction.nom.startsWith('(anonymous')) continue
    const deja = fonctionsParNom.get(fonction.nom) ?? []
    deja.push(fonction)
    fonctionsParNom.set(fonction.nom, deja)
  }
}

/** La déclaration locale d'un nom dans `appStore.ts`, s'il y en a une. */
function declarationLocale(nom) {
  const motif = new RegExp(
    `(?:^|\\n)\\s*(?:const|let|(?:async\\s+)?function)\\s+${nom}\\b`,
  )
  const trouve = motif.exec(masque)
  return trouve ? trouve.index + trouve[0].length : null
}

const morts = []
const irresolus = []
const exemptionsUtilisees = new Set()

for (const port of ports) {
  if (HORS_CARTE_ASSUMES.has(port.nom) && port.raccourci) {
    exemptionsUtilisees.add(port.nom)
    port.verdict = 'exempté'
    continue
  }

  // a. Une fonction écrite sur place : la première de la carte dans l'entrée.
  const surPlace = fonctionsDuMagasin.find(
    (f) => f.ou >= port.debut && f.ou < port.fin,
  )
  if (surPlace) {
    port.fonction = surPlace
  } else {
    // b. Un renvoi : `nom,` ou `nom: autre` ou `nom: objet.membre`.
    const renvoi = /^([A-Za-z_$][\w$.]*)$/.exec(
      port.raccourci ? port.nom : port.valeur,
    )
    if (!renvoi) {
      irresolus.push(port)
      continue
    }
    const cible = renvoi[1].split('.').pop()
    const ici = declarationLocale(cible)
    const local =
      ici === null
        ? null
        : fonctionsDuMagasin.find((f) => f.ou >= ici - cible.length && f.ou <= ici + 2)
    if (local) {
      port.fonction = local
    } else {
      const ailleurs = fonctionsParNom.get(cible) ?? []
      if (ailleurs.length === 1) {
        port.fonction = ailleurs[0]
      } else if (ailleurs.length > 1) {
        echouer(
          `Le port \`${port.nom}\` de \`${port.tranche}\` renvoie à \`${cible}\`,` +
            ` et ${String(ailleurs.length)} fonctions portent ce nom :\n` +
            ailleurs.map((f) => `  ${f.fichier}:${String(f.ligne)}`).join('\n') +
            "\n\nUn nom qui désigne deux choses ne répond pas à « celle-ci a-t-elle" +
            ' été appelée ». Renommer, ou exempter en écrivant pourquoi.',
        )
      } else {
        irresolus.push(port)
        continue
      }
    }
  }

  if (port.fonction.appels === 0) morts.push(port)
}

if (irresolus.length > 0) {
  console.error(
    `Ports qu'on ne sait pas relier à une fonction — ` +
      `${String(irresolus.length)} :\n`,
  )
  for (const port of irresolus) {
    console.error(
      `  ${port.tranche}.${port.nom}\n    ${source.slice(port.debut, port.fin).trim().slice(0, 90)}`,
    )
  }
  console.error(
    "\nUn port que l'instrument ne voit pas est un port qu'il ne garde pas, et\n" +
      "le taire est ce qui a fait publier « 0 jamais appelé » sur les deux\n" +
      'cinquièmes du sujet. Rendre le port lisible, ou l\'inscrire dans\n' +
      '`HORS_CARTE_ASSUMES` avec son motif.',
  )
  process.exit(1)
}

if (morts.length > 0) {
  console.error(`Ports de dépendance jamais appelés — ${String(morts.length)} :\n`)
  for (const port of morts) {
    console.error(
      `  ${port.tranche}.${port.nom}\n` +
        `    ${port.fonction.fichier}:${String(port.fonction.ligne)}, 0 appel`,
    )
  }
  console.error(
    '\nLa tranche est éprouvée contre un double, la lambda ne l\'est par rien :\n' +
      "les deux moitiés se croient couvertes par l'autre. Écrire la question\n" +
      'depuis `useAppStore` — `tests/unit/cablageDuMagasin.test.ts` montre\n' +
      'comment.',
  )
  process.exit(1)
}

const exemptionsPerimees = [...HORS_CARTE_ASSUMES.keys()].filter(
  (nom) => !exemptionsUtilisees.has(nom),
)
if (exemptionsPerimees.length > 0) {
  console.error(
    "Exemptions devenues inutiles : ces noms ne sont plus des ports du\n" +
      'magasin, et `HORS_CARTE_ASSUMES` les garde pour rien. Les en retirer :\n',
  )
  for (const nom of exemptionsPerimees) console.error(`  ${nom}`)
  process.exit(1)
}

const nommant = ports.filter((p) => p.fonction).length
console.log(
  `Ports du magasin : ${String(ports.length)} sur ${String(blocs.length)} tranches, ` +
    `dont ${String(nommant)} nomment une fonction — toutes appelées ` +
    `(${String(ports.length - nommant)} hors carte assumés).`,
)
