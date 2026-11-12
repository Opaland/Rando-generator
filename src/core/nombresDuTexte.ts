/**
 * Les nombres d'un texte, et ceux qui ne viennent pas des faits (issue #673).
 *
 * Claude écrit le texte d'un bilan ; le code a calculé chaque nombre. Un
 * nombre du texte qui n'est ni un fait ni l'arrondi d'un fait serait un
 * chiffre présenté comme une mesure sans en être une — exactement ce que le
 * §2 de CLAUDE.md interdit. Le texte qui en porte un n'est pas affiché.
 *
 * Principe repris de l'analyse mensuelle du dépôt Netatmo, avec ce que le
 * français y ajoute : la virgule décimale, les espaces de milliers (normale,
 * insécable, fine insécable), et les nombres **en lettres**, qui
 * contourneraient sinon la vérification (« douze sorties »).
 *
 * Volontairement strict : « neuf » (l'adjectif) ou « cent » (« pour cent »)
 * sont lus comme des nombres, et un texte juste peut donc être refusé. La
 * consigne demande des chiffres et le symbole « % » pour cette raison.
 *
 * Ce qui est garanti, et seulement cela : **aucun nombre du texte n'est
 * inventé**. Qu'il soit attaché à la bonne grandeur ne l'est pas (voir
 * `nombresInconnus`) ; « vérifié » ne se dit pas davantage à l'écran.
 */

/**
 * Un nombre en chiffres : pas précédé d'une lettre ou d'un chiffre (« GR7 »
 * est un nom, pas une quantité). Un rang (« 3e », « 1er ») et une unité
 * collée (« 412km ») sont lus : un rang est un nombre que le modèle aurait
 * calculé, et une unité collée ne doit pas permettre d'échapper à la
 * vérification (relecture adverse du 11/11).
 */
const EN_CHIFFRES =
  /(?<![\p{L}\d.,])[-−]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?!\d)/gu

const POURCENT_SUIT = /^[ \u00a0\u202f]*%/

/**
 * Les mots qui forment un nombre en lettres. « Un » et « une » n'en sont
 * qu'à l'intérieur d'un composé (« trente et un », « vingt-et-une ») : seuls,
 * ce sont d'abord des articles.
 */
const UNITES: Readonly<Record<string, number>> = {
  zéro: 0, zero: 0, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
  quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60,
}
const ARTICLES: Readonly<Record<string, number>> = { un: 1, une: 1 }
const MULTIPLES: Readonly<Record<string, number>> = { cent: 100, cents: 100, mille: 1000 }

/**
 * Ce qui se lit seul et vaut un nombre que le modèle aurait calculé : un
 * rang, une fraction, un multiple.
 */
const ISOLES: Readonly<Record<string, number>> = {
  premier: 1, première: 1, second: 2, seconde: 2, deuxième: 2, troisième: 3,
  quatrième: 4, cinquième: 5, sixième: 6, septième: 7, huitième: 8,
  neuvième: 9, dixième: 10, onzième: 11, douzième: 12,
  moitié: 0.5, demi: 0.5, demie: 0.5, tiers: 1 / 3, quart: 0.25,
  double: 2, triple: 3,
}

const MOT_OU_SEPARATEUR = /\p{L}+|[-\s]+/gu

/** La valeur d'un composé (« quatre-vingt-dix », « deux cent cinquante »). */
function valeurDuCompose(mots: readonly string[]): number {
  let total = 0
  let courant = 0
  let precedent = ''
  for (const mot of mots) {
    if (mot === 'et') continue
    if (Object.hasOwn(MULTIPLES, mot)) {
      const m = MULTIPLES[mot] as number
      if (m === 1000) {
        total += (courant || 1) * 1000
        courant = 0
      } else {
        courant = (courant || 1) * m
      }
    } else if ((mot === 'vingt' || mot === 'vingts') && precedent === 'quatre') {
      courant = courant - 4 + 80
    } else {
      courant += (UNITES[mot] ?? ARTICLES[mot]) as number
    }
    precedent = mot
  }
  return total + courant
}

/** Les nombres écrits en lettres, chaque composé lu comme un seul nombre. */
function nombresEnLettres(texte: string): number[] {
  const jetons = [...texte.toLowerCase().matchAll(MOT_OU_SEPARATEUR)].map((m) => m[0])
  const nombres: number[] = []
  let compose: string[] = []
  const clore = () => {
    if (compose.length > 0) nombres.push(valeurDuCompose(compose))
    compose = []
  }
  for (let i = 0; i < jetons.length; i++) {
    const jeton = jetons[i] as string
    if (/^[-\s]+$/.test(jeton)) continue
    const nombre = Object.hasOwn(UNITES, jeton) || Object.hasOwn(MULTIPLES, jeton)
    // « et un », « et une » prolongent un composé ouvert ; « et » seul aussi,
    // s'il est suivi d'une unité (« trente et une »).
    const prolonge =
      compose.length > 0 &&
      (Object.hasOwn(ARTICLES, jeton) ||
        (jeton === 'et' && (Object.hasOwn(ARTICLES, jetons[i + 2] ?? '') || Object.hasOwn(UNITES, jetons[i + 2] ?? ''))))
    if (nombre || prolonge) {
      compose.push(jeton)
      continue
    }
    clore()
    if (Object.hasOwn(ISOLES, jeton)) nombres.push(ISOLES[jeton] as number)
  }
  clore()
  return nombres
}

interface NombreLu {
  valeur: number
  /** Suivi du signe « % » : il ne vaut que contre un pourcentage des faits. */
  pourcent: boolean
}

function nombresLus(texte: string): NombreLu[] {
  const chiffres = [...texte.matchAll(EN_CHIFFRES)].map((m) => ({
    valeur: Number(
      m[0]
        .replace('−', '-')
        .replace(/[ \u00a0\u202f]/g, '')
        .replace(',', '.'),
    ),
    pourcent: POURCENT_SUIT.test(texte.slice(m.index + m[0].length)),
  }))
  return [
    ...chiffres.filter((n) => Number.isFinite(n.valeur)),
    ...nombresEnLettres(texte).map((valeur) => ({ valeur, pourcent: false })),
  ]
}

/** Les nombres du texte, en chiffres puis en lettres, dans cet ordre. */
export function nombresDuTexte(texte: string): number[] {
  return nombresLus(texte).map((n) => n.valeur)
}

const cle = (n: number): number => Math.round(Math.abs(n) * 100) / 100

/**
 * Les valeurs permises : chaque nombre des faits, à 0, 1 ou 2 décimales
 * (« 412,37 » s'écrit « 412,4 » ou « 412 »), et les nombres écrits dans
 * leurs chaînes (« GR 7 »). Jamais ceux des clés : une clé `top3` ne permet
 * pas d'écrire « 3 ». À part, les pourcentages : les valeurs rangées sous
 * une clé qui le dit (`pct`, `pourcent`) — « 12 % » n'est permis que là.
 */
function permis(faits: unknown): { tout: Set<number>; pourcents: Set<number> } {
  const tout = new Set<number>()
  const pourcents = new Set<number>()
  const parcourir = (valeur: unknown, estPourcent: boolean): void => {
    if (typeof valeur === 'number' && Number.isFinite(valeur)) {
      for (const decimales of [0, 1, 2]) {
        const f = 10 ** decimales
        const k = cle(Math.round(valeur * f) / f)
        tout.add(k)
        if (estPourcent) pourcents.add(k)
      }
    } else if (typeof valeur === 'string') {
      for (const n of nombresDuTexte(valeur)) parcourir(n, estPourcent)
    } else if (Array.isArray(valeur)) {
      for (const v of valeur) parcourir(v, estPourcent)
    } else if (valeur !== null && typeof valeur === 'object') {
      for (const [k, v] of Object.entries(valeur)) {
        parcourir(v, estPourcent || /pct|pourcent/i.test(k))
      }
    }
  }
  parcourir(faits, false)
  return { tout, pourcents }
}

/**
 * Les nombres du texte qui ne sont ni un fait ni l'arrondi d'un fait — ou,
 * suivis de « % », ni un pourcentage des faits.
 *
 * Ce que la vérification **ne** garantit **pas** : qu'un nombre du texte
 * soit attaché à la bonne grandeur. « 9 km » passe si 9 est le nombre de
 * sorties. Elle garantit qu'aucun nombre n'est inventé ; l'interface le dit
 * en ces termes, pas davantage.
 */
export function nombresInconnus(texte: string, faits: unknown): number[] {
  const { tout, pourcents } = permis(faits)
  return nombresLus(texte)
    .filter((n) => !(n.pourcent ? pourcents : tout).has(cle(n.valeur)))
    .map((n) => n.valeur)
}
