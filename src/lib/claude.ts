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
  const texte = reponse.content
    .flatMap((bloc) => (bloc.type === 'text' ? [bloc.text] : []))
    .join('\n')
  return {
    texte,
    modele: reponse.model,
    coutDollars: coutEnDollars(reponse.model, reponse.usage),
  }
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
