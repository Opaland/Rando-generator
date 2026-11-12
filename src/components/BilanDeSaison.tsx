import { useMemo, useState } from 'react'
import { anneesDeSorties, faitsDeSaison } from '../core/faitsDeSaison.ts'
import { CONSIGNE_BILAN, messageDesFaits } from '../core/redactionClaude.ts'
import { useContoursDeZone } from '../lib/useContoursDeZone.ts'
import { useAppStore } from '../store/appStore.ts'
import { RedactionClaude } from './RedactionClaude.tsx'
import styles from './BilanDeSaison.module.css'

/**
 * Le bilan de saison écrit par Claude (issue #673), dans « Mes sorties ».
 * Les faits sont calculés par `faitsDeSaison` ; la demande, la vérification
 * et l'affichage vivent dans `RedactionClaude`, commun aux usages.
 */
export function BilanDeSaison() {
  const tracks = useAppStore((s) => s.tracks)
  const contours = useContoursDeZone()
  const annees = useMemo(() => anneesDeSorties(tracks), [tracks])
  const [choisie, setChoisie] = useState<number | null>(null)
  const annee = choisie !== null && annees.includes(choisie) ? choisie : (annees[0] ?? null)
  const faits = useMemo(
    () => (annee === null ? null : faitsDeSaison(tracks, annee, contours)),
    [tracks, annee, contours],
  )
  if (!faits) return null

  return (
    <section className={styles.bilan} data-testid="bilan-saison">
      <h4 className={styles.titre}>Bilan de saison, écrit par Claude</h4>
      <RedactionClaude
        // Une autre année repart de zéro : le texte d'avant ne la concerne pas.
        key={faits.annee}
        faits={faits}
        consigne={CONSIGNE_BILAN}
        message={messageDesFaits(faits)}
        libelle={`Écrire le bilan ${String(faits.annee)}`}
        sansCle="Facultatif : collez votre clé d’API Anthropic dans Réglages pour que Claude écrive le bilan de votre année."
        prefixe="bilan"
        avant={
          annees.length > 1 && (
            <label>
              Année{' '}
              <select
                value={faits.annee}
                onChange={(e) => {
                  setChoisie(Number(e.target.value))
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
          )
        }
      />
    </section>
  )
}
