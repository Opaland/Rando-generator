/**
 * Lire une question en toutes lettres, et ne prétendre comprendre que ce
 * qu'on a compris — pierre 0 de `docs/IA_LOCALE.md`.
 *
 * ## Pourquoi ceci avant un modèle
 *
 * La note d'architecture décrit une recherche sémantique locale — MiniLM,
 * 23 Mo, WebWorker — et s'arrête net : trois chiffres manquent, et aucun ne
 * s'invente (CLAUDE.md §2). Elle reste vraie.
 *
 * Mais elle laissait dans l'ombre ce qui ne demande ni modèle ni mesure :
 * **une bonne part des questions qu'on pose à une application de randonnée
 * sont déjà exprimables avec les filtres qui existent.** « Une boucle de
 * moins de 10 km, pas plus de 300 m de dénivelé » n'a besoin d'aucun
 * plongement — elle a besoin qu'on la lise.
 *
 * Et sans cette base, on ne saurait pas juger le modèle le jour où il
 * arrivera : une recherche sémantique se compare à une recherche littérale,
 * jamais au vide. C'est le point 3 de la section 5 de la note, qui réclamait
 * « vingt questions écrites d'avance » — les voici exécutables.
 *
 * ## La règle qui tient tout le module
 *
 * **Ce qui n'est pas sûr n'est pas deviné, il est rendu.** Chaque mot non
 * reconnu part dans `incompris`, et l'interface le montre. Remplir un filtre
 * au jugé donnerait une liste dont personne ne saurait d'où elle vient — le
 * défaut qu'une IA de randonnée fait payer sur un sentier, où l'on suit ce
 * que l'écran dit.
 *
 * Deux conséquences visibles dans le code :
 *
 * - **« accessible » n'est pas traduit.** Le mot ne désigne pas un
 *   revêtement. Nadia s'est méfiée du pictogramme parce qu'il l'a déjà
 *   envoyée sur un sentier qu'elle n'a pas pu faire ; le rendre en
 *   `sol: 'roulant'` serait exactement la promesse fausse que `discovery.ts`
 *   refuse. « Poussette » et « fauteuil », eux, disent ce qui roule ;
 * - **aucun nombre n'est inventé.** Ils viennent de la question, ou de
 *   constantes déjà décidées : « facile » vaut `SEUIL_FACILE_MINUTES`, parce
 *   que le mot doit vouloir dire dans la recherche ce qu'il veut déjà dire
 *   dans la liste. Deux définitions du même mot dans la même application,
 *   c'est le §4ter en plus discret.
 */

import {
  ALL_FILTERS,
  SEUIL_FACILE_MINUTES,
  SEUIL_MOYEN_MINUTES,
  type DiscoveryFilters,
} from './discovery.ts'

/** Un morceau de la question qui a servi, et ce qu'il a rempli. */
export interface Fragment {
  /** Le texte reconnu, tel qu'il a été lu. */
  texte: string
  /** Le champ de `DiscoveryFilters` qu'il pose. */
  champ: keyof DiscoveryFilters
}

export interface Intention {
  filtres: DiscoveryFilters
  compris: Fragment[]
  /**
   * Les mots restants, dans leur ordre d'origine.
   *
   * Ce n'est pas un déchet : c'est ce que l'interface doit montrer pour que
   * quelqu'un sache que « avec des chèvres » n'a pas été pris en compte.
   */
  incompris: string[]
}

/**
 * Les mots qui ne demandent rien.
 *
 * Ils sont ici pour que `incompris` garde un sens : rendre « une », « de »,
 * « avec » ferait passer un lecteur qui a tout compris pour un lecteur
 * perdu, et plus personne ne relirait la liste.
 *
 * La liste ne cherche pas l'exhaustivité du français — seulement les mots
 * qu'on écrit en demandant une randonnée.
 */
const MOTS_DE_LIAISON = new Set([
  'un',
  'une',
  'des',
  'du',
  'de',
  'd',
  'le',
  'la',
  'les',
  'l',
  'a',
  'à',
  'au',
  'aux',
  'en',
  'et',
  'ou',
  'avec',
  'sans',
  'pour',
  'par',
  'sur',
  'dans',
  'vers',
  'chez',
  'que',
  'qui',
  'plus',
  'moins',
  'pas',
  'trop',
  'très',
  'assez',
  'maximum',
  'max',
  'minimum',
  'min',
  'environ',
  'je',
  'j',
  'on',
  'nous',
  'me',
  'moi',
  'mon',
  'ma',
  'mes',
  'ce',
  'cette',
  'veux',
  'cherche',
  'chercher',
  'voudrais',
  'aimerais',
  'faire',
  'trouver',
  'rando',
  'randonnée',
  'randonnées',
  'balade',
  'balades',
  'sortie',
  'sorties',
  'marche',
  'chemin',
  'chemins',
  'sentier',
  'sentiers',
  'itinéraire',
  'itinéraires',
  'parcours',
  'truc',
  'quelque',
  'chose',
  'difficulté',
  'niveau',
  'sil',
  'possible',
  'plutôt',
])

/** Nombre à la française : « 7,5 » autant que « 7.5 ». */
const NOMBRE = String.raw`(\d+(?:[.,]\d+)?)`
const KM = String.raw`(?:km|kilom[eè]tres?)`
const BORNE_HAUTE = String.raw`(?:moins\s+de|au\s+plus|pas\s+plus\s+de|jusqu'?[àa])`
const BORNE_BASSE = String.raw`(?:plus\s+de|au\s+moins|au\s+minimum|[àa]\s+partir\s+de)`

function nombre(brut: string | undefined): number {
  return Number((brut ?? '').replace(',', '.'))
}

/**
 * Une règle de lecture : un motif, et ce qu'il pose.
 *
 * L'ordre du tableau **décide**, et ce n'est pas un détail de mise en œuvre :
 * « à 30 km de chez moi » et « une rando de 30 km » portent le même nombre et
 * la même unité. Seul le voisinage les distingue, donc la proximité se lit
 * d'abord, sur la question entière, avant que la règle des distances ne voie
 * ce qui reste.
 */
interface Regle {
  motif: RegExp
  pose: (m: RegExpExecArray, f: DiscoveryFilters) => keyof DiscoveryFilters
}

const REGLES: Regle[] = [
  // 1. La proximité, en premier : elle se reconnaît à son « de chez moi ».
  {
    motif: new RegExp(
      String.raw`[àa]?\s*(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*${KM}\s+(?:de\s+)?(?:chez\s+)?(?:moi|ici|ma\s+position)`,
      'i',
    ),
    pose: (m, f) => {
      f.maxAwayKm = nombre(m[1])
      return 'maxAwayKm'
    },
  },

  // 2. L'intervalle avant les bornes simples : « entre 8 et 12 km » contient
  //    un « 12 km » que la règle 5 lirait toute seule, et à moitié.
  {
    motif: new RegExp(
      String.raw`entre\s+${NOMBRE}\s*(?:${KM})?\s+et\s+${NOMBRE}\s*${KM}`,
      'i',
    ),
    pose: (m, f) => {
      f.minKm = nombre(m[1])
      f.maxKm = nombre(m[2])
      return 'maxKm'
    },
  },

  // 3. Le dénivelé se reconnaît au mot, jamais à l'unité : des mètres sans
  //    « dénivelé » ni « D+ » restent des mètres.
  {
    motif: new RegExp(
      String.raw`(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*m(?:[eè]tres?)?\s+(?:de\s+)?(?:d[ée]nivel[ée]|d\+)`,
      'i',
    ),
    pose: (m, f) => {
      f.maxGain = nombre(m[1])
      return 'maxGain'
    },
  },
  {
    /*
      « dénivelé de moins de 300 m » : le `de` de la tournure vient **avant**
      la borne, et la première écriture de ce motif l'attendait après. Elle
      ne lisait donc que « dénivelé moins de 300 m », que personne n'écrit.

      Trouvé par le rapport de couverture — deux lignes jamais atteintes — et
      non en relisant : le motif avait l'air complet.
    */
    motif: new RegExp(
      String.raw`d[ée]nivel[ée]\s+(?:de\s+)?(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*m(?:[eè]tres?)?`,
      'i',
    ),
    pose: (m, f) => {
      f.maxGain = nombre(m[1])
      return 'maxGain'
    },
  },

  // 4. Les durées. « 2h30 » d'abord, sinon « 2 h » mangerait le 2 et
  //    laisserait « 30 » orphelin dans l'incompris.
  {
    motif: new RegExp(
      String.raw`(?:${BORNE_HAUTE}\s+)?(\d+)\s*h\s*(\d{2})`,
      'i',
    ),
    pose: (m, f) => {
      f.maxMinutes = Number(m[1]) * 60 + Number(m[2])
      return 'maxMinutes'
    },
  },
  {
    motif: new RegExp(
      String.raw`(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*(?:h\b|heures?)`,
      'i',
    ),
    pose: (m, f) => {
      f.maxMinutes = Math.round(nombre(m[1]) * 60)
      return 'maxMinutes'
    },
  },
  {
    motif: new RegExp(
      String.raw`(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*(?:min\b|minutes?)`,
      'i',
    ),
    pose: (m, f) => {
      f.maxMinutes = Math.round(nombre(m[1]))
      return 'maxMinutes'
    },
  },

  // 5. Les distances, une fois la proximité et l'intervalle écartés.
  {
    motif: new RegExp(String.raw`${BORNE_BASSE}\s+${NOMBRE}\s*${KM}`, 'i'),
    pose: (m, f) => {
      f.minKm = nombre(m[1])
      return 'minKm'
    },
  },
  {
    motif: new RegExp(String.raw`(?:${BORNE_HAUTE}\s+)?${NOMBRE}\s*${KM}`, 'i'),
    /*
      Une distance nue est lue comme une borne haute.

      « Une rando de 10 km » n'exprime pas de direction, et les filtres
      n'offrent qu'un minimum et un maximum : « au plus » est la seule
      lecture *exprimable*. Ce n'est pas un nombre inventé — c'est celui
      qu'on a écrit — mais c'est un choix de sens, et il se voit dans
      `compris` plutôt que de se deviner.
    */
    pose: (m, f) => {
      f.maxKm = nombre(m[1])
      return 'maxKm'
    },
  },

  // 6. L'effort, aux seuils déjà décidés par `discovery.ts`.
  {
    motif: /\bfaciles?\b/i,
    pose: (_m, f) => {
      f.maxMinutes = SEUIL_FACILE_MINUTES
      return 'maxMinutes'
    },
  },
  {
    motif: /\bmoyennes?\b|\bmoyens?\b/i,
    pose: (_m, f) => {
      f.maxMinutes = SEUIL_MOYEN_MINUTES
      return 'maxMinutes'
    },
  },

  // 7. La forme du tracé.
  {
    motif: /\bboucles?\b|\bcirculaires?\b/i,
    pose: (_m, f) => {
      f.shape = 'loop'
      return 'shape'
    },
  },
  {
    motif: /\baller\s+simple\b|\blin[ée]aires?\b|\btravers[ée]es?\b/i,
    pose: (_m, f) => {
      f.shape = 'linear'
      return 'shape'
    },
  },

  // 8. Le sol, par ce qui roule dessus — jamais par « accessible ».
  {
    motif: /\bpoussettes?\b|\bfauteuils?\b|\broulants?\b|\bpoussette\b/i,
    pose: (_m, f) => {
      f.sol = 'roulant'
      return 'sol'
    },
  },
]

/** Les mots qui restent, une fois retiré ce que les règles ont consommé. */
function motsRestants(reste: string): string[] {
  return reste
    .split(/[^\p{L}\p{N}+]+/u)
    .map((mot) => mot.trim())
    .filter((mot) => mot !== '' && !MOTS_DE_LIAISON.has(mot))
}

export function lireIntention(question: string): Intention {
  const filtres: DiscoveryFilters = { ...ALL_FILTERS }
  const compris: Fragment[] = []

  /*
    On efface au fur et à mesure plutôt que de garder des index : une règle
    qui a lu « à 30 km de chez moi » doit rendre le reste de la phrase à la
    suivante, et rien d'autre. Un masque d'index dirait la même chose en
    deux fois plus de lignes, et se tromperait sur les accents.
  */
  let reste = question.toLowerCase().replace(/[’‘]/g, "'")

  for (const regle of REGLES) {
    const trouve = regle.motif.exec(reste)
    if (!trouve) continue
    const champ = regle.pose(trouve, filtres)
    compris.push({ texte: trouve[0].trim(), champ })
    reste =
      reste.slice(0, trouve.index) +
      ' ' +
      reste.slice(trouve.index + trouve[0].length)
  }

  return { filtres, compris, incompris: motsRestants(reste) }
}
