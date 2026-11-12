import { useMemo, useState } from 'react'
import { anneesDeSorties, faitsDeSaison } from '../core/faitsDeSaison.ts'
import { CONSIGNE_BILAN, messageDesFaits, verdictDuTexte } from '../core/redactionClaude.ts'
import { useContoursDeZone } from '../lib/useContoursDeZone.ts'
import { useCleClaude } from '../store/cleClaude.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './BilanDeSaison.module.css'

type Etat =
  | { etape: 'repos' }
  | { etape: 'envoi' }
  | { etape: 'texte'; faits: object; texte: string; modele: string; coutDollars: number | null }
  | { etape: 'retenu'; faits: object; inconnus: number[] }
  | { etape: 'erreur'; message: string }

const DOLLARS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 3,
})

/**
 * Le bilan de saison écrit par Claude (issue #673). Les faits sont calculés
 * ici (`faitsDeSaison`) et **montrés avant l'envoi** ; le texte revenu n'est
 * affiché que si chacun de ses nombres vient de ces faits (`verdictDuTexte`).
 */
export function BilanDeSaison() {
  const tracks = useAppStore((s) => s.tracks)
  const cle = useCleClaude((s) => s.cle)
  const contours = useContoursDeZone()
  const annees = useMemo(() => anneesDeSorties(tracks), [tracks])
  const [choisie, setChoisie] = useState<number | null>(null)
  const annee = choisie !== null && annees.includes(choisie) ? choisie : (annees[0] ?? null)
  const faits = useMemo(
    () => (annee === null ? null : faitsDeSaison(tracks, annee, contours)),
    [tracks, annee, contours],
  )
  const [etat, setEtat] = useState<Etat>({ etape: 'repos' })

  if (!faits) return null
  // Un texte n'est montré qu'avec les faits contre lesquels il a été vérifié :
  // une sortie importée ou supprimée depuis le rend caduc (relecture du 11/11).
  const aJour = (etat.etape === 'texte' || etat.etape === 'retenu') && etat.faits === faits

  const demander = async () => {
    if (!cle) return
    setEtat({ etape: 'envoi' })
    let module: typeof import('../lib/claude.ts')
    try {
      module = await import('../lib/claude.ts')
    } catch {
      setEtat({ etape: 'erreur', message: 'Hors ligne : Claude n’est pas joignable.' })
      return
    }
    try {
      const r = await module.rediger(cle, CONSIGNE_BILAN, messageDesFaits(faits))
      const verdict = verdictDuTexte(r.texte, faits)
      setEtat(
        verdict.montrable
          ? { etape: 'texte', faits, texte: verdict.texte, modele: r.modele, coutDollars: r.coutDollars }
          : { etape: 'retenu', faits, inconnus: verdict.inconnus },
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
    <section className={styles.bilan} data-testid="bilan-saison">
      <h4 className={styles.titre}>Bilan de saison, écrit par Claude</h4>
      {!cle ? (
        <p className={styles.aide} data-testid="bilan-sans-cle">
          Facultatif : collez votre clé d’API Anthropic dans Réglages pour que
          Claude écrive le bilan de votre année.
        </p>
      ) : (
        <>
          <div className={styles.ligne}>
            {annees.length > 1 && (
              <label>
                Année{' '}
                <select
                  value={annee ?? ''}
                  onChange={(e) => {
                    setChoisie(Number(e.target.value))
                    setEtat({ etape: 'repos' })
                  }}
                  data-testid="bilan-annee"
                >
                  {annees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              disabled={etat.etape === 'envoi'}
              onClick={() => void demander()}
              data-testid="bilan-demander"
            >
              {etat.etape === 'envoi' ? 'Claude écrit…' : `Écrire le bilan ${String(annee)}`}
            </button>
          </div>
          <details className={styles.envoye}>
            <summary data-testid="bilan-envoye">Ce qui sera envoyé à Anthropic</summary>
            <pre data-testid="bilan-faits">{JSON.stringify(faits, null, 1)}</pre>
          </details>
        </>
      )}
      {aJour && etat.etape === 'texte' && (
        <div data-testid="bilan-texte">
          <p className={styles.texte}>{etat.texte}</p>
          <p className={styles.aide}>
            Écrit par {etat.modele}
            {etat.coutDollars !== null && ` — coût ${DOLLARS.format(etat.coutDollars)}`}.
            Aucun nombre n’y est inventé : chacun figure dans les totaux
            ci-dessus.
          </p>
        </div>
      )}
      {aJour && etat.etape === 'retenu' && (
        <p className={styles.alerte} role="status" data-testid="bilan-retenu">
          Texte non affiché : il contenait{' '}
          {etat.inconnus.length > 0
            ? `un nombre qui ne vient pas de vos sorties (${etat.inconnus.join(', ')})`
            : 'rien de lisible'}
          . Vous pouvez redemander.
        </p>
      )}
      {etat.etape === 'erreur' && (
        <p className={styles.alerte} role="alert" data-testid="bilan-erreur">
          {etat.message}
        </p>
      )}
    </section>
  )
}
