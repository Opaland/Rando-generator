import { useState, type ReactNode } from 'react'
import { verdictDuTexte } from '../core/redactionClaude.ts'
import { useCleClaude } from '../store/cleClaude.ts'
import styles from './RedactionClaude.module.css'

type Etat =
  | { etape: 'repos' }
  | { etape: 'envoi' }
  | { etape: 'texte'; faits: string; texte: string; modele: string; coutDollars: number | null }
  | { etape: 'retenu'; faits: string; inconnus: number[] }
  | { etape: 'erreur'; message: string }

const DOLLARS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 3,
})

/**
 * Demander un texte à Claude sur des faits calculés par le code (issue #673).
 *
 * Une seule fois pour tous les usages — bilan de saison, récit d'une sortie —
 * parce que c'est ici que vivent les gardes : les faits **montrés avant
 * l'envoi**, le texte **retenu** s'il porte un nombre absent des faits, et
 * caduc dès que les faits changent. Recopiées par usage, ces gardes
 * divergeraient (CLAUDE.md §4).
 *
 * `prefixe` nomme les `data-testid` : `bilan-demander`, `recit-texte`…
 */
export function RedactionClaude({
  faits,
  consigne,
  message,
  libelle,
  sansCle,
  prefixe,
  avant,
}: {
  faits: object
  consigne: string
  message: string
  libelle: string
  sansCle: string
  prefixe: string
  avant?: ReactNode
}) {
  const cle = useCleClaude((s) => s.cle)
  const [etat, setEtat] = useState<Etat>({ etape: 'repos' })
  // Un texte n'est montré qu'avec les faits contre lesquels il a été vérifié :
  // une sortie importée ou supprimée depuis le rend caduc (relecture du 11/11).
  // Comparés par leur **contenu**, pas par l'objet : des faits recalculés à
  // l'identique (les contours arrivés en cours de route) ne doivent pas faire
  // disparaître en silence un texte payé par la clé de l'utilisateur (12/11).
  const envoyes = JSON.stringify(faits)
  const aJour = (etat.etape === 'texte' || etat.etape === 'retenu') && etat.faits === envoyes

  if (!cle) {
    return (
      <p className={styles.aide} data-testid={`${prefixe}-sans-cle`}>
        {sansCle}
      </p>
    )
  }

  const demander = async () => {
    setEtat({ etape: 'envoi' })
    let module: typeof import('../lib/claude.ts')
    try {
      module = await import('../lib/claude.ts')
    } catch {
      setEtat({ etape: 'erreur', message: 'Hors ligne : Claude n’est pas joignable.' })
      return
    }
    try {
      const r = await module.rediger(cle, consigne, message)
      const verdict = verdictDuTexte(r.texte, faits)
      setEtat(
        verdict.montrable
          ? { etape: 'texte', faits: envoyes, texte: verdict.texte, modele: r.modele, coutDollars: r.coutDollars }
          : { etape: 'retenu', faits: envoyes, inconnus: verdict.inconnus },
      )
    } catch (erreur) {
      setEtat({
        etape: 'erreur',
        message:
          erreur instanceof module.ErreurClaude ? erreur.message : 'La demande n’a pas abouti.',
      })
    }
  }

  return (
    <>
      <div className={styles.ligne}>
        {avant}
        <button
          type="button"
          disabled={etat.etape === 'envoi'}
          onClick={() => void demander()}
          data-testid={`${prefixe}-demander`}
        >
          {etat.etape === 'envoi' ? 'Claude écrit…' : libelle}
        </button>
      </div>
      <details className={styles.envoye}>
        <summary data-testid={`${prefixe}-envoye`}>Ce qui sera envoyé à Anthropic</summary>
        <pre data-testid={`${prefixe}-faits`}>{JSON.stringify(faits, null, 1)}</pre>
      </details>
      {aJour && etat.etape === 'texte' && (
        <div data-testid={`${prefixe}-texte`}>
          <p className={styles.texte}>{etat.texte}</p>
          <p className={styles.aide}>
            Écrit par {etat.modele}
            {etat.coutDollars !== null && ` — coût ${DOLLARS.format(etat.coutDollars)}`}.
            Aucun nombre n’y est inventé : chacun figure dans ce qui a été
            envoyé.
          </p>
        </div>
      )}
      {aJour && etat.etape === 'retenu' && (
        <p className={styles.alerte} role="status" data-testid={`${prefixe}-retenu`}>
          Texte non affiché : il contenait{' '}
          {etat.inconnus.length > 0
            ? `un nombre qui ne vient pas de vos sorties (${etat.inconnus.join(', ')})`
            : 'rien de lisible'}
          . Vous pouvez redemander.
        </p>
      )}
      {etat.etape === 'erreur' && (
        <p className={styles.alerte} role="alert" data-testid={`${prefixe}-erreur`}>
          {etat.message}
        </p>
      )}
    </>
  )
}
