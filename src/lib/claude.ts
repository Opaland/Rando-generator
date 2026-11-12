import { MODELE_CLAUDE, coutEnDollars } from '../core/redactionClaude.ts'

/**
 * L'appel à Claude (issue #673), avec la clé de l'utilisateur.
 *
 * Le SDK d'Anthropic est chargé **à la demande** (`import()`) : personne ne
 * le télécharge sans s'en servir, et le premier écran n'en porte pas le poids.
 *
 * `dangerouslyAllowBrowser` : le SDK refuse par défaut de tourner dans un
 * navigateur, parce qu'une clé **du site** y serait exposée à tous. Ici la
 * clé est celle de la personne qui tient le navigateur, et ne va que chez
 * Anthropic — c'est le cas que l'option existe pour permettre.
 *
 * Repli côté serveur (`fallbacks: 'default'`) : si Claude Opus 5.5 décline,
 * Anthropic relance la même demande sur un autre modèle, dans le même appel.
 * Le modèle qui a réellement répondu est rendu, et son coût n'est affiché que
 * s'il a un tarif connu (`coutEnDollars`).
 */

interface Redaction {
  texte: string
  modele: string
  coutDollars: number | null
}

/** Une erreur dont le message est écrit pour la personne, pas pour la console. */
export class ErreurClaude extends Error {}

export async function rediger(
  cle: string,
  consigne: string,
  message: string,
): Promise<Redaction> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 1 })
  let reponse
  try {
    reponse = await client.beta.messages.create({
      model: MODELE_CLAUDE,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: consigne,
      messages: [{ role: 'user', content: message }],
    })
  } catch (erreur) {
    throw new ErreurClaude(messageDErreur(erreur, Anthropic))
  }
  if (reponse.stop_reason === 'refusal') {
    throw new ErreurClaude('Claude a décliné cette demande. Rien n’a été affiché.')
  }
  // Un texte coupé passerait la vérification et s'afficherait comme complet,
  // parfois coupé au milieu d'un nombre (relecture adverse du 12/11).
  if (reponse.stop_reason === 'max_tokens') throw new ErreurClaude(COUPEE)
  const texte = reponse.content
    .flatMap((bloc) => (bloc.type === 'text' ? [bloc.text] : []))
    .join('\n')
  return {
    texte,
    modele: reponse.model,
    coutDollars: coutEnDollars(reponse.model, reponse.usage),
  }
}

const COUPEE = 'La réponse de Claude a été coupée avant la fin : rien n’a été affiché. Redemandez.'

/** Au-delà, Claude tourne en rond : on s'arrête et on le dit. */
const TOURS_MAX = 6

interface Reponse extends Redaction {
  /** Ce que les outils ont rendu, dans l'ordre : ce qui est parti, et les faits de la vérification. */
  resultats: unknown[]
}

/**
 * Une question sur ses sorties (#673, troisième usage). Claude reçoit la
 * question et la liste des outils ; chaque appel d'outil est exécuté **ici**
 * par `executer`, et seul son résultat — des totaux — repart. La boucle est
 * écrite à la main : elle est courte, et chaque résultat doit être gardé
 * pour la vérification des nombres.
 */
export async function repondre(
  cle: string,
  consigne: string,
  question: string,
  outils: readonly {
    name: string
    description: string
    input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false }
    strict: true
  }[],
  executer: (nom: string, entree: unknown) => unknown,
): Promise<Reponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 1 })
  type Message = Parameters<typeof client.beta.messages.create>[0]['messages'][number]
  const messages: Message[] = [{ role: 'user', content: question }]
  const resultats: unknown[] = []
  let cout: number | null = 0
  for (let tour = 0; tour < TOURS_MAX; tour++) {
    let reponse
    try {
      reponse = await client.beta.messages.create({
        model: MODELE_CLAUDE,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: consigne,
        tools: [...outils],
        messages,
      })
    } catch (erreur) {
      throw new ErreurClaude(messageDErreur(erreur, Anthropic))
    }
    if (reponse.stop_reason === 'refusal') {
      throw new ErreurClaude('Claude a décliné cette demande. Rien n’a été affiché.')
    }
    const coutDuTour = coutEnDollars(reponse.model, reponse.usage)
    cout = cout === null || coutDuTour === null ? null : cout + coutDuTour
    if (reponse.stop_reason === 'max_tokens') throw new ErreurClaude(COUPEE)
    const appels = reponse.content.flatMap((b) => (b.type === 'tool_use' ? [b] : []))
    if (reponse.stop_reason === 'pause_turn') {
      // Le serveur rend la main en cours de tour : on renvoie tel quel pour
      // qu'il reprenne, sans rien exécuter.
      messages.push({ role: 'assistant', content: reponse.content })
      continue
    }
    if (reponse.stop_reason !== 'tool_use' || appels.length === 0) {
      const texte = reponse.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
      if (!texte.trim()) throw new ErreurClaude('Claude n’a rien répondu. Reformulez la question.')
      return {
        texte,
        modele: reponse.model,
        coutDollars: cout,
        resultats,
      }
    }
    // Le contenu entier repart, blocs de réflexion compris : l'API les
    // attend inchangés d'un tour à l'autre.
    messages.push({ role: 'assistant', content: reponse.content })
    messages.push({
      role: 'user',
      content: appels.map((appel) => {
        const resultat = executer(appel.name, appel.input)
        resultats.push(resultat)
        return { type: 'tool_result' as const, tool_use_id: appel.id, content: JSON.stringify(resultat) }
      }),
    })
  }
  throw new ErreurClaude('Claude n’a pas conclu après plusieurs allers-retours. Reformulez la question.')
}

function messageDErreur(
  erreur: unknown,
  Anthropic: typeof import('@anthropic-ai/sdk').default,
): string {
  if (erreur instanceof Anthropic.AuthenticationError) {
    return 'Anthropic refuse cette clé. Vérifiez-la dans Réglages.'
  }
  if (erreur instanceof Anthropic.PermissionDeniedError) {
    return 'Cette clé n’a pas accès à Claude Opus 5.5.'
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return 'Trop de demandes, ou crédit épuisé : réessayez plus tard.'
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return 'Anthropic ne répond pas : êtes-vous en ligne ?'
  }
  if (erreur instanceof Anthropic.APIError) {
    return `Anthropic a répondu par une erreur (${String(erreur.status ?? '?')}).`
  }
  return 'La demande n’a pas abouti.'
}
