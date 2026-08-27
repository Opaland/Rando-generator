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
  /**
   * Le second symbole, quand la balise en porte deux (ex. `white_dot`).
   *
   * La grammaire l'admet depuis toujours ; nous ne le lisions pas. Un sentier
   * balisé « rectangle rouge **et** disque blanc » était décrit comme un
   * simple rectangle rouge — pas faux, incomplet, et **incomplet en
   * silence** (issue #290). C'est le mode d'échec que ce dépôt connaît le
   * mieux : une omission qui a l'air d'une réponse.
   */
  secondPlan: string | null
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
  if (!couleurVoie) return null
  /*
    Le fond et le premier plan peuvent être **vides**, et c'est une
    information, pas une saisie manquante.

    Un fond vide : le symbole est peint à même le support, sans cartouche.
    `red::white_upper:red_lower:501:black` est la forme la plus fréquente des
    Vosges — quinze relations sur les 1 035 mesurées.

    Un premier plan vide avec un texte : la balise ne porte qu'un mot,
    `red:red::IVV:white`. Sept relations. Les refuser toutes deux revenait à
    n'afficher aucune ligne de balisage là où la donnée est complète.

    Ce qu'on refuse encore : les deux vides à la fois **sans texte** — il n'y
    a alors rien à décrire.
  */
  if (!fond && !premierPlan) return null
  /*
    Le second symbole ne peut occuper que la quatrième place : la grammaire
    est positionnelle. On le reconnaît au `_` — un nom de symbole en porte
    toujours un (`red_bar`, `blue_dot`), un texte de balise pratiquement
    jamais, puisque c'est un numéro ou une lettre.
  */
  const quatrieme = champs[3]
  const secondPlan =
    quatrieme && quatrieme.includes('_') ? quatrieme : null
  // Le texte est le premier champ suivant qui n'est pas un nom de symbole.
  const texte = champs.slice(3).find((c) => c !== '' && !c.includes('_'))
  return {
    couleurVoie,
    fond,
    premierPlan,
    secondPlan,
    texte: texte ?? null,
  }
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
  /*
    Les quatre moitiés — et pourquoi elles se disent comme ça.

    `lower` était traduit « demi-disque », ce qui **affirme une forme ronde**.
    La notation ne dit rien de tel : elle dit quelle moitié de la balise porte
    la couleur, quelle que soit la découpe du support. « demi-disque » était
    donc une interprétation, pas une traduction — et sur un support carré,
    fausse.

    Mesuré le 27/08 sur 1 035 relations vosgiennes : `upper` manquait
    18 fois, `right` 5 fois, alors que `lower` était là depuis toujours. Les
    trois vont ensemble ou ne veulent rien dire.

    Le wiki OpenStreetMap, qui donnerait la géométrie exacte, est refusé par
    la politique réseau de cette machine — vérifié le 27/08. On s'en tient
    donc à ce qui est certain : le nom du champ, traduit littéralement. Une
    « moitié inférieure rouge » est vraie que la balise soit ronde, carrée ou
    triangulaire.
  */
  lower: 'moitié inférieure',
  upper: 'moitié supérieure',
  right: 'moitié droite',
  left: 'moitié gauche',
  /*
    La coquille de Saint-Jacques. `shell` et `shell_modern` se dessinent
    différemment — l'ancienne stylisée, la moderne celle des panneaux
    officiels — mais les deux **sont** une coquille, et c'est le nom qu'on
    traduit. Perdre la nuance de dessin coûte moins que taire le symbole.
  */
  shell: 'coquille',
  shell_modern: 'coquille',
  pointer: 'flèche',
  wheel: 'roue',
  turned_T: 'T renversé',
}

/** Les formes féminines, pour l'accord de la couleur. */
const FEMININ = new Set([
  'bande',
  'moitié inférieure',
  'moitié supérieure',
  'moitié droite',
  'moitié gauche',
  'coquille',
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
function lireSymbole(
  brut: string,
): { couleur: string | null; forme: string } | null {
  /*
    Une forme peut venir **sans couleur** : `shell_modern` est un nom de
    forme entier, pas un `couleur_forme`. Le découpage au premier `_` en
    ferait « couleur *shell*, forme *modern* », et rendrait `null`.

    Trouvé en écrivant le test, pas en relisant : `blue:blue:shell_modern`
    existe dans les données vosgiennes, et le symbole n'y porte pas de
    couleur propre — il prend celle du dessin.
  */
  const formeEntiere = FORMES[brut]
  if (formeEntiere) return { couleur: null, forme: formeEntiere }

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
/**
 * « rectangle rouge », « bande blanche » — l'accord se fait sur la forme.
 *
 * Nommé plutôt que recopié : la question se pose désormais deux fois, pour le
 * premier symbole et pour le second, et une garde transverse se nomme (§4).
 */
function nommerSymbole(symbole: {
  couleur: string | null
  forme: string
}): string {
  // Sans couleur, on ne nomme que la forme : en inventer une serait annoncer
  // une marque qu'on n'aura pas devant les yeux.
  if (symbole.couleur === null) return symbole.forme
  const couleur = FEMININ.has(symbole.forme)
    ? (FEMININS_COULEUR[symbole.couleur] ?? symbole.couleur)
    : symbole.couleur
  return `${symbole.forme} ${couleur}`
}

export function decrireBalisage(tag: string | undefined): string | null {
  const lu = lireBalisage(tag)
  if (!lu) return null

  /*
    Un fond vide n'est pas un fond inconnu : c'est l'absence de cartouche.
    La phrase perd alors sa clause « sur fond … », et n'en invente pas.
  */
  const fond = lu.fond === '' ? null : (COULEURS[lu.fond] ?? null)
  if (lu.fond !== '' && fond === null) return null
  const surFond =
    fond === null
      ? ''
      : ` sur fond ${fond === 'blanc' ? fond : (FEMININS_COULEUR[fond] ?? fond)}`

  /*
    Une balise qui ne porte qu'un texte — `red:red::IVV:white`. Sans symbole
    à décrire, il reste le mot, et c'est tout ce qu'on dira. Rendre `null`
    ferait disparaître une ligne dont la donnée est pourtant complète.
  */
  if (lu.premierPlan === '') {
    if (!lu.texte) return null
    return `balise${surFond}, marquée « ${lu.texte} »`
  }

  const symbole = lireSymbole(lu.premierPlan)
  if (!symbole) return null

  /*
    Le second symbole, quand il y en a un (issue #290).

    Deux cas, et le second est celui qui compte : s'il n'est pas dans nos
    tables, on **le dit** au lieu de le laisser tomber. Rendre `null` pour
    tout le tag perdrait un premier symbole parfaitement lu ; l'ignorer
    rendrait une description incomplète qui a l'air complète — exactement ce
    que l'issue reproche.
  */
  const second = lu.secondPlan ? lireSymbole(lu.secondPlan) : null
  const symboles =
    second !== null
      ? `${nommerSymbole(symbole)} et ${nommerSymbole(second)}`
      : nommerSymbole(symbole)
  const inconnu =
    lu.secondPlan !== null && second === null
      ? ', plus un second symbole que nous ne savons pas lire'
      : ''

  const base = `${symboles}${surFond}${inconnu}`
  return lu.texte ? `${base}, marqué « ${lu.texte} »` : base
}
