import { nombresInconnus } from './nombresDuTexte.ts'

/**
 * Ce qui se décide sans réseau dans un texte écrit par Claude (issue #673) :
 * le modèle, la consigne, le coût, et si le texte peut être montré.
 *
 * L'appel lui-même vit dans `src/lib/claude.ts`, chargé à la demande : il
 * tire le SDK d'Anthropic, que personne ne doit télécharger sans s'en servir.
 */

/** Claude Opus 5.5 : le modèle par défaut, choisi le 11/11 (#673). */
export const MODELE_CLAUDE = 'claude-opus-5-5'

/**
 * Tarifs publics, en dollars par million de jetons (entrée, sortie), relevés
 * le 11/11/2026 dans la référence de l'API. La lecture du cache coûte 0,1×
 * l'entrée, son écriture 1,25×.
 *
 * Seuls les modèles qu'on peut recevoir y sont : celui qu'on demande. Le
 * repli côté serveur (`fallbacks: 'default'`) peut en servir un autre — son
 * coût n'est alors **pas** affiché plutôt que deviné (§2).
 */
const TARIFS: Readonly<Record<string, readonly [number, number]>> = {
  'claude-opus-5-5': [4, 20],
}

interface Usage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** Le coût d'une réponse, ou `null` si le modèle qui l'a servie n'a pas de tarif connu. */
export function coutEnDollars(modele: string, usage: Usage): number | null {
  const tarif = Object.hasOwn(TARIFS, modele) ? TARIFS[modele] : undefined
  if (!tarif) return null
  const [entree, sortie] = tarif
  return (
    ((usage.input_tokens ?? 0) * entree +
      (usage.cache_read_input_tokens ?? 0) * entree * 0.1 +
      (usage.cache_creation_input_tokens ?? 0) * entree * 1.25 +
      (usage.output_tokens ?? 0) * sortie) /
    1_000_000
  )
}

/**
 * Les règles des nombres, **une fois** pour toutes les consignes (§4).
 *
 * Elles ne suffisent pas à garantir les nombres : `verdictDuTexte` les
 * revérifie. Elles servent à ce que le texte passe du premier coup.
 */
const REGLES = [
  'Règles absolues :',
  '- N’écris aucun nombre qui ne figure pas tel quel dans les faits (arrondi permis), ni en chiffres ni en lettres : pas de différence, de moyenne, de rang ni de pourcentage que tu calculerais toi-même.',
  '- Écris les nombres en chiffres, et les pourcentages avec le symbole %, seulement là où les faits en donnent un.',
  '- N’invente ni lieu, ni sentier, ni météo, ni ressenti : seuls les zones et les itinéraires nommés dans les faits existent.',
  '- Un champ à null signifie que la mesure manque : ne la mentionne pas.',
  '- Les zones sont celles que les traces approchent, à une centaine de mètres près : écris « du côté de » ou « autour de », jamais « dans », et n’en tire ni départ ni arrivée.',
]

/** La consigne d'un bilan de saison (`faitsDeSaison`). */
export const CONSIGNE_BILAN = [
  'Tu écris, en français, le bilan de la saison de randonnée d’une personne, à partir des faits fournis en JSON.',
  ...REGLES,
  'Forme : trois à cinq phrases, au vouvoiement, sans titre, sans liste, sans mise en forme. Ton chaleureux et sobre.',
].join('\n')

/** La consigne du récit d'une sortie (`faitsDeSortie`). */
export const CONSIGNE_SORTIE = [
  'Tu écris, en français, le court récit d’une sortie de randonnée, à partir des faits fournis en JSON : sa longueur, son dénivelé, et ce qu’elle a fait avancer sur les itinéraires balisés.',
  ...REGLES,
  '- Si autresItinerairesNonNommes est vrai, la sortie a aussi avancé des itinéraires que les faits ne nomment pas : n’écris jamais qu’elle n’en a avancé aucun, et ne les devine pas.',
  'Forme : deux à quatre phrases, au vouvoiement, sans titre, sans liste, sans mise en forme. Ton chaleureux et sobre.',
].join('\n')

/**
 * La consigne des questions sur ses sorties (`outilsDeQuestions`). Les
 * « faits » y sont les résultats des outils que Claude appelle : il ne voit
 * rien d'autre.
 */
export const CONSIGNE_QUESTIONS = [
  'Tu réponds, en français, à une question d’une personne sur ses propres sorties de randonnée. Tu ne vois pas ses sorties : appelle les outils, qui calculent sur son appareil et rendent des totaux. Les faits sont ce que les outils rendent, et les nombres écrits dans la question.',
  ...REGLES,
  '- Si les outils ne permettent pas de répondre, dis-le simplement, et dis ce qu’ils savent mesurer. Ne réponds à rien d’autre qu’aux sorties de la personne.',
  'Forme : une à quatre phrases, au vouvoiement, sans titre, sans liste, sans mise en forme.',
].join('\n')

/** Le message envoyé : les faits, et rien d'autre. */
export function messageDesFaits(faits: unknown): string {
  return `Faits (JSON) :\n${JSON.stringify(faits, null, 1)}`
}

type Verdict =
  | { montrable: true; texte: string }
  | { montrable: false; inconnus: number[] }

/** Le texte peut-il être montré ? Seulement si chacun de ses nombres vient des faits. */
export function verdictDuTexte(texte: string, faits: unknown): Verdict {
  const propre = texte.trim()
  if (!propre) return { montrable: false, inconnus: [] }
  const inconnus = nombresInconnus(propre, faits)
  return inconnus.length === 0
    ? { montrable: true, texte: propre }
    : { montrable: false, inconnus }
}
