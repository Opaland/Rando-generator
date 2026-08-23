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
        {/*
          Ce qui défile quand l'écran est court, et rien d'autre : le titre
          reste en haut, « Voir un exemple » reste en bas. Voir le
          commentaire de `.card` dans la feuille de style — c'est le seul
          arrangement trouvé qui tienne à la fois U1 (le bouton atteignable
          au premier lancement) et U4 (l'attribution jamais recouverte) sur
          un 360 × 640.
        */}
        <div className={styles.corps}>
          <ol className={styles.steps}>
            {/* Repère de test : la première étape doit rester à l'écran.
                Un premier essai de mise en page l'avait réduite à zéro
                pixel sans qu'aucun test ne s'en aperçoive. */}
            <li data-testid="guide-etape-1">
              <strong>Choisissez une zone</strong> dans le panneau (ou un ref
              comme « GR 20 ») : les itinéraires balisés d’OpenStreetMap
              s’affichent.
            </li>
            <li>
              {/* Même correction qu'au dépôt de traces : le geste qui marche
                  partout passe devant (AUDIT_UX.md, constat U12). Une
                  correction de texte se fait sur toutes les surfaces, et
                  celle-ci en avait deux (CLAUDE.md §3). */}
              <strong>Enregistrez votre sortie</strong>, ou ajoutez vos
              fichiers GPX — vos sorties passées, ou un parcours à faire dans
              « Mes itinéraires ».
            </li>
            <li>
              <strong>Lisez votre progression</strong> : carte colorée,
              pourcentages, kilomètres restants.
            </li>
          </ol>
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
        <button
          type="button"
          className={`btn-primary ${styles.demo}`}
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
      </div>
    </div>
  )
}
