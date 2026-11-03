import { useRef, useState } from 'react'
import { fermerEnRendantLeFocus } from '../lib/focusSuivant.ts'
import { useAppStore } from '../store/appStore.ts'
import { FinDeDemonstration } from './FinDeDemonstration.tsx'
import styles from './DemoBanner.module.css'

/**
 * Bandeau de démonstration (issue #172).
 *
 * Une démonstration doit être visiblement une démonstration : sans quoi
 * l'utilisateur croit voir ses données, et le produit ment. Elle se quitte
 * d'un seul geste, et n'a de toute façon rien écrit en base.
 */
export function DemoBanner() {
  const demonstration = useAppStore((s) => s.demonstration)
  const quitterDemonstration = useAppStore((s) => s.quitterDemonstration)
  const finDeDemonstration = useAppStore((s) => s.finDeDemonstration)
  const [sortie, setSortie] = useState(false)
  const bandeau = useRef<HTMLDivElement>(null)

  // Un geste réel l'a éteinte : le dire, plutôt que vider le tableau (#615).
  if (!demonstration && finDeDemonstration) return <FinDeDemonstration />
  if (!demonstration) return null

  return (
    <div ref={bandeau} className={styles.bandeau} role="status" data-testid="demo-banner">
      <p className={styles.texte}>
        <strong>Démonstration.</strong> Ces trois sorties sont fictives, les
        boucles sont réelles. Rien n’est enregistré : importez vos propres
        traces pour voir vos vrais chiffres.
      </p>
      <button
        type="button"
        className={styles.quitter}
        data-testid="demo-quitter"
        disabled={sortie}
        onClick={() => {
          setSortie(true)
          fermerEnRendantLeFocus(bandeau.current, () =>
            quitterDemonstration().finally(() => { setSortie(false) }),
          )
        }}
      >
        Quitter la démonstration
      </button>
    </div>
  )
}
