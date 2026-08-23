import { useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import styles from './EmptyState.module.css'

/** Guide de premier lancement, affiché tant qu'aucune donnée n'est chargée. */
export function EmptyState() {
  const demarrerDemonstration = useAppStore((s) => s.demarrerDemonstration)
  const setGuideFerme = useAppStore((s) => s.setGuideFerme)
  const fermerGuide = () => setGuideFerme(true)
  const [prepare, setPrepare] = useState(false)

  return (
    <div className={styles.overlay} data-testid="onboarding">
      <div className={styles.card}>
        {/*
          Fermer un guide qu'on a lu est un geste attendu. Il manquait : la
          surcouche restait tant qu'aucune donnée n'était chargée, c'est-à-dire
          exactement pendant qu'on voulait regarder la carte pour décider.
          Le rappel « Guide de démarrage » le rouvre — voir rappelGuideVisible.
        */}
        <button
          type="button"
          className={`btn-icon-close ${styles.fermer}`}
          data-testid="onboarding-fermer"
          aria-label="Fermer le guide de démarrage"
          onClick={() => {
            void fermerGuide()
          }}
        >
          ×
        </button>
        <h2 className={styles.title}>Bienvenue sur Sentiers</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Choisissez une zone</strong> dans le panneau (ou un ref
            comme « GR 20 ») : les itinéraires balisés d’OpenStreetMap
            s’affichent.
          </li>
          <li>
            {/* Même correction qu'au dépôt de traces : le geste qui marche
                partout passe devant (AUDIT_UX.md, constat U12). Une
                correction de texte se fait sur toutes les surfaces, et
                celle-ci en avait deux (CLAUDE.md §3). */}
            <strong>Ajoutez vos fichiers GPX</strong> — vos sorties passées, ou
            un parcours à faire dans « Mes itinéraires ».
          </li>
          <li>
            <strong>Lisez votre progression</strong> : carte colorée,
            pourcentages, kilomètres restants.
          </li>
        </ol>
        <button
          type="button"
          className={styles.demo}
          data-testid="voir-un-exemple"
          disabled={prepare}
          onClick={() => {
            setPrepare(true)
            void demarrerDemonstration().finally(() => {
              setPrepare(false)
            })
          }}
        >
          {prepare ? 'Préparation…' : 'Voir un exemple'}
        </button>
        <p className={styles.demoAide}>
          Des boucles réelles de la Métropole de Lyon et trois sorties
          fictives, pour voir à quoi ressemblent les chiffres. Rien n’est
          enregistré.
        </p>
        <p className={styles.privacy}>
          Vos traces sont lues et gardées dans votre navigateur : elles ne
          partent nulle part. Les fonds de carte, eux, viennent de l’IGN —
          «&nbsp;À propos&nbsp;» dit exactement qui reçoit quoi.
        </p>
      </div>
    </div>
  )
}
