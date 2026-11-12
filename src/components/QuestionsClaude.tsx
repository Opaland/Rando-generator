import { useState } from 'react'
import { OUTILS_DE_QUESTIONS, executerOutil } from '../core/outilsDeQuestions.ts'
import { CONSIGNE_QUESTIONS, verdictDuTexte } from '../core/redactionClaude.ts'
import { useContoursDeZone } from '../lib/useContoursDeZone.ts'
import { useAppStore } from '../store/appStore.ts'
import { useCleClaude } from '../store/cleClaude.ts'
import styles from './RedactionClaude.module.css'

type Etat =
  | { etape: 'repos' }
  | { etape: 'envoi' }
  | { etape: 'reponse'; texte: string; modele: string; coutDollars: number | null; envoye: object; base: Base }
  | { etape: 'retenu'; inconnus: number[]; envoye: object; base: Base }
  | { etape: 'erreur'; message: string }

const DOLLARS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })

/**
 * Les données contre lesquelles une réponse a été calculée. Si l'une change
 * — une sortie importée ou supprimée, l'avancement recalculé —, la réponse
 * est caduque, et l'écran le dit (relecture adverse du 12/11).
 */
interface Base {
  tracks: unknown
  resultats: unknown
  itineraires: unknown
}

/**
 * Longueur du champ : une ligne. Seuil de présentation, tranché au jugement
 * (§2) — ce n'est **pas** une garde : la question part telle quelle, et ses
 * nombres sont permis dans la réponse, puisqu'ils viennent de la personne.
 */
const LONGUEUR_MAX = 300

/**
 * Les questions sur ses sorties (issue #673, troisième usage), dans « Mes
 * sorties ». Claude ne reçoit que la question, puis les totaux qu'il demande
 * aux outils (`outilsDeQuestions`), calculés ici. Ce qui est parti est montré
 * avec la réponse — on ne peut pas le montrer avant : c'est Claude qui
 * choisit ses outils en répondant. La réponse n'est affichée que si chacun
 * de ses nombres vient de la question ou des résultats des outils.
 */
export function QuestionsClaude() {
  const cle = useCleClaude((s) => s.cle)
  const tracks = useAppStore((s) => s.tracks)
  const itineraires = useAppStore((s) => s.itineraries)
  const resultats = useAppStore((s) => s.matching?.results)
  const contours = useContoursDeZone()
  const [question, setQuestion] = useState('')
  const [etat, setEtat] = useState<Etat>({ etape: 'repos' })

  if (!cle || tracks.length === 0) return null
  const caduque =
    (etat.etape === 'reponse' || etat.etape === 'retenu') &&
    (etat.base.tracks !== tracks || etat.base.resultats !== resultats || etat.base.itineraires !== itineraires)

  const demander = async () => {
    const posee = question.trim()
    if (!posee) return
    setEtat({ etape: 'envoi' })
    let module: typeof import('../lib/claude.ts')
    try {
      module = await import('../lib/claude.ts')
    } catch {
      setEtat({ etape: 'erreur', message: 'Hors ligne : Claude n’est pas joignable.' })
      return
    }
    // `null` et non `[]` tant que l'avancement n'est pas calculé : l'outil dit
    // alors que la mesure manque, au lieu de laisser écrire « aucun ».
    const donnees = { tracks, resultats: resultats ?? null, itineraires, contours }
    const base: Base = { tracks, resultats, itineraires }
    try {
      const r = await module.repondre(cle, CONSIGNE_QUESTIONS, posee, OUTILS_DE_QUESTIONS, (nom, entree) => {
        try {
          return executerOutil(nom, entree, donnees)
        } catch {
          return { erreur: 'calcul impossible' }
        }
      })
      const envoye = { question: posee, resultats: r.resultats }
      const verdict = verdictDuTexte(r.texte, envoye)
      setEtat(
        verdict.montrable
          ? { etape: 'reponse', texte: verdict.texte, modele: r.modele, coutDollars: r.coutDollars, envoye, base }
          : { etape: 'retenu', inconnus: verdict.inconnus, envoye, base },
      )
    } catch (erreur) {
      setEtat({
        etape: 'erreur',
        message: erreur instanceof module.ErreurClaude ? erreur.message : 'La demande n’a pas abouti.',
      })
    }
  }

  return (
    <section data-testid="questions-claude">
      <form
        className={styles.ligne}
        onSubmit={(e) => {
          e.preventDefault()
          void demander()
        }}
      >
        <label>
          Demander à Claude, sur vos sorties{' '}
          <input
            type="text"
            maxLength={LONGUEUR_MAX}
            value={question}
            placeholder="Quel a été mon plus gros mois en 2026 ?"
            onChange={(e) => {
              setQuestion(e.target.value)
            }}
            data-testid="questions-champ"
          />
        </label>
        <button type="submit" disabled={etat.etape === 'envoi' || !question.trim()} data-testid="questions-demander">
          {etat.etape === 'envoi' ? 'Claude répond…' : 'Demander'}
        </button>
      </form>
      <p className={styles.aide}>
        Claude reçoit votre question, puis seulement les totaux qu’il demande
        — jamais une trace, un nom de fichier ni un jour. Tout ce qui est
        parti est montré avec la réponse.
      </p>
      {caduque && (
        <p className={styles.alerte} role="status" data-testid="questions-caduque">
          Vos sorties ont changé depuis cette réponse : redemandez pour qu’elle
          porte sur ce que vous avez maintenant.
        </p>
      )}
      {!caduque && etat.etape === 'reponse' && (
        <div data-testid="questions-reponse">
          <p className={styles.texte}>{etat.texte}</p>
          <p className={styles.aide}>
            Écrit par {etat.modele}
            {etat.coutDollars !== null && ` — coût ${DOLLARS.format(etat.coutDollars)}`}. Aucun
            nombre n’y est inventé : chacun figure dans ce qui a été envoyé.
          </p>
        </div>
      )}
      {!caduque && etat.etape === 'retenu' && (
        <p className={styles.alerte} role="status" data-testid="questions-retenu">
          Réponse non affichée : elle contenait un nombre qui ne vient pas de vos
          sorties ({etat.inconnus.join(', ') || 'rien de lisible'}). Vous pouvez redemander.
        </p>
      )}
      {(etat.etape === 'reponse' || etat.etape === 'retenu') && (
        <details className={styles.envoye}>
          <summary data-testid="questions-envoye">Ce qui est parti chez Anthropic</summary>
          <pre data-testid="questions-faits">{JSON.stringify(etat.envoye, null, 1)}</pre>
        </details>
      )}
      {etat.etape === 'erreur' && (
        <p className={styles.alerte} role="alert" data-testid="questions-erreur">
          {etat.message}
        </p>
      )}
    </section>
  )
}
