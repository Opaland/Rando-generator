import { useDefilerVersAlerte } from '../lib/useDefilerVersAlerte.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './DemoBanner.module.css'

/**
 * « Démonstration terminée » : un geste réel l'a éteinte, et on le dit
 * plutôt que de vider le tableau sans un mot (#615).
 *
 * Au téléphone, ce geste (toucher une zone) fait aussi défiler la feuille :
 * l'avis, posé en tête, sortait par le haut — monté, et invisible (#657,
 * mesuré le 03/11 : 283 px de défilement). Il est ramené dans le champ comme
 * les autres alertes. Monté seulement quand il a quelque chose à dire, il
 * peut le faire dès son premier rendu.
 */
export function FinDeDemonstration() {
  const oublierFin = useAppStore((s) => s.oublierFinDeDemonstration)
  const avis = useDefilerVersAlerte<HTMLDivElement>(true)
  return (
    <div ref={avis} className={styles.bandeau} role="status" data-testid="demo-terminee">
      <p className={styles.texte}>Démonstration terminée : les sorties fictives sont retirées.</p>
      <button type="button" className={styles.quitter} onClick={oublierFin}>
        Compris
      </button>
    </div>
  )
}
