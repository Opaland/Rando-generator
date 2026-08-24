/**
 * Lecture d'`osmc:symbol` — ce qui est réellement peint sur l'arbre.
 *
 * Le Club Vosgien (#286) ne balise pas en GR / GR de Pays / PR : il balise en
 * **formes géométriques colorées** — rectangle rouge, disque bleu, croix
 * jaune — où la forme dit le rang de l'itinéraire. Sur un massif où le
 * balisage *est* le système de navigation, forcer ces sentiers dans la
 * taxonomie fédérale française leur donne une couleur qui n'a rien à voir
 * avec ce qu'on verra en levant les yeux.
 *
 * Mais `osmc:symbol` n'a rien de vosgien : c'est la notation standardisée
 * d'OSM, employée dans toute l'Europe. On la lit donc pour elle-même, plutôt
 * que de coder un cas particulier « Club Vosgien » qui vieillirait mal.
 *
 * **On traduit, on n'interprète pas.** « rectangle rouge sur fond blanc » est
 * ce que dit le tag. En déduire « donc c'est un PR » serait refaire l'erreur
 * de #284 dans l'autre sens : affirmer un classement qu'on n'a pas lu.
 */

export interface Balisage {
  /** Couleur de la voie elle-même, souvent redondante avec le reste. */
  couleurVoie: string
  /** Fond de la balise peinte. */
  fond: string
  /** Le symbole posé dessus, ex. `red_bar`. */
  premierPlan: string
  /** Le texte porté par la balise, quand elle en porte un (ex. « 7 »). */
  texte: string | null
}

/**
 * Grammaire : `voie:fond:premier_plan[:second_plan][:texte[:couleur_texte]]`.
 *
 * Les trois premiers champs sont obligatoires. Au-delà, la position du texte
 * varie selon qu'un second symbole est présent — on le reconnaît au fait
 * qu'il ne ressemble pas à un nom de symbole, c'est-à-dire qu'il ne contient
 * pas de `_`.
 */
export function lireBalisage(tag: string | undefined): Balisage | null {
  if (!tag) return null
  const champs = tag.split(':').map((c) => c.trim())
  if (champs.length < 3) return null
  const [couleurVoie, fond, premierPlan] = champs as [string, string, string]
  if (!couleurVoie || !fond || !premierPlan) return null
  // Le texte est le premier champ suivant qui n'est pas un nom de symbole.
  // Un nom de symbole porte toujours un `_` (`red_bar`, `blue_dot`), un texte
  // de balise pratiquement jamais — c'est un numéro ou une lettre.
  const texte = champs.slice(3).find((c) => c !== '' && !c.includes('_'))
  return { couleurVoie, fond, premierPlan, texte: texte ?? null }
}

/**
 * Les couleurs de la notation, telles qu'OSM les nomme.
 *
 * Volontairement incomplète : une couleur absente fait rendre `null` plutôt
 * qu'un mot approximatif. Mieux vaut une fiche sans ligne « balisage » qu'une
 * fiche qui annonce une couleur qu'on n'aura pas devant les yeux.
 */
const COULEURS: Record<string, string> = {
  red: 'rouge',
  blue: 'bleu',
  green: 'vert',
  yellow: 'jaune',
  orange: 'orange',
  black: 'noir',
  white: 'blanc',
  brown: 'marron',
  purple: 'violet',
  gray: 'gris',
  grey: 'gris',
}

/**
 * Les formes, au masculin — l'accord se fait sur le nom de la forme, pas sur
 * la couleur, d'où deux tables séparées plutôt qu'une chaîne toute faite.
 */
const FORMES: Record<string, string> = {
  bar: 'rectangle',
  stripe: 'bande',
  dot: 'disque',
  circle: 'cercle',
  triangle: 'triangle',
  cross: 'croix',
  x: 'croix de Saint-André',
  diamond: 'losange',
  rectangle: 'rectangle',
  frame: 'cadre',
  arch: 'arche',
  corner: 'angle',
  slash: 'barre oblique',
  backslash: 'barre oblique inverse',
  L: 'L',
  lower: 'demi-disque',
  pointer: 'flèche',
  wheel: 'roue',
  turned_T: 'T renversé',
}

/** Les formes féminines, pour l'accord de la couleur. */
const FEMININ = new Set([
  'bande',
  'croix',
  'croix de Saint-André',
  'arche',
  'barre oblique',
  'barre oblique inverse',
  'flèche',
  'roue',
])

/** Le féminin des couleurs qui en ont un. Les autres sont invariables. */
const FEMININS_COULEUR: Record<string, string> = {
  blanc: 'blanche',
  vert: 'verte',
  violet: 'violette',
  gris: 'grise',
}

/**
 * Un symbole s'écrit `couleur_forme` — `red_bar`, `blue_dot`. La forme peut
 * elle-même contenir un `_` (`turned_T`), donc on découpe au **premier**.
 */
function lireSymbole(brut: string): { couleur: string; forme: string } | null {
  const coupure = brut.indexOf('_')
  if (coupure <= 0) return null
  const couleur = COULEURS[brut.slice(0, coupure)]
  const forme = FORMES[brut.slice(coupure + 1)]
  if (!couleur || !forme) return null
  return { couleur, forme }
}

/**
 * Décrit le balisage en français, ou rend `null` si quoi que ce soit dans le
 * tag n'a pas été compris.
 *
 * `null` n'est pas un échec à rattraper : c'est le comportement voulu. La
 * fiche n'affiche alors pas de ligne « balisage », ce qui est exact — on ne
 * sait pas — là où un mot approximatif enverrait quelqu'un chercher une
 * marque qui n'existe pas.
 */
export function decrireBalisage(tag: string | undefined): string | null {
  const lu = lireBalisage(tag)
  if (!lu) return null
  const symbole = lireSymbole(lu.premierPlan)
  const fond = COULEURS[lu.fond]
  if (!symbole || !fond) return null
  const couleur = FEMININ.has(symbole.forme)
    ? (FEMININS_COULEUR[symbole.couleur] ?? symbole.couleur)
    : symbole.couleur
  const fondAccorde = FEMININS_COULEUR[fond] ?? fond
  const base = `${symbole.forme} ${couleur} sur fond ${fond === 'blanc' ? fond : fondAccorde}`
  return lu.texte ? `${base}, marqué « ${lu.texte} »` : base
}
