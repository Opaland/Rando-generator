import styles from './EmptyState.module.css'

/** Guide de premier lancement, affiché tant qu'aucune donnée n'est chargée. */
export function EmptyState() {
  return (
    <div className={styles.overlay} data-testid="onboarding">
      <div className={styles.card}>
        <h2 className={styles.title}>Bienvenue sur Sentiers</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Choisissez une zone</strong> dans le panneau (ou un ref
            comme « GR 20 ») : les itinéraires balisés d’OpenStreetMap
            s’affichent.
          </li>
          <li>
            <strong>Glissez vos fichiers GPX</strong> — vos sorties passées, ou
            un parcours à faire dans « Mes itinéraires ».
          </li>
          <li>
            <strong>Lisez votre progression</strong> : carte colorée,
            pourcentages, kilomètres restants.
          </li>
        </ol>
        <p className={styles.privacy}>
          Vos traces sont lues et gardées dans votre navigateur : elles ne
          partent nulle part. Les fonds de carte, eux, viennent de l’IGN —
          «&nbsp;À propos&nbsp;» dit exactement qui reçoit quoi.
        </p>
      </div>
    </div>
  )
}
