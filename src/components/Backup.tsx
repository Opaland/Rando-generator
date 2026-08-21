import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { estSafari } from '../core/stockage.ts'
import { formatOctets } from '../lib/format.ts'
import styles from './Backup.module.css'

/**
 * Sauvegarde complète : l'exporter, la relire ailleurs (issue #132).
 *
 * Tout vit dans l'IndexedDB du navigateur. Rien ne suit d'un appareil à
 * l'autre, et vider les données du site efface des années de traces. C'est le
 * prix de « vos traces ne quittent jamais votre navigateur » — et un prix
 * doit être annoncé, pas découvert.
 */
export function Backup() {
  const tracks = useAppStore((s) => s.tracks)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const exporterSauvegarde = useAppStore((s) => s.exporterSauvegarde)
  const importerSauvegarde = useAppStore((s) => s.importerSauvegarde)
  const backupMessage = useAppStore((s) => s.backupMessage)
  const clearBackupMessage = useAppStore((s) => s.clearBackupMessage)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [enCours, setEnCours] = useState(false)
  const stockage = useAppStore((s) => s.stockage)
  const rafraichirStockage = useAppStore((s) => s.rafraichirStockage)

  // Mesuré à l'ouverture de la section, et non au chargement de la page :
  // c'est ici que le chiffre a une raison d'être lu.
  useEffect(() => {
    void rafraichirStockage()
  }, [rafraichirStockage, tracks.length])

  const webkit =
    typeof navigator === 'undefined' ? false : estSafari(navigator.userAgent)

  const aQuelqueChose = tracks.length > 0 || customItineraries.length > 0

  return (
    <details className={styles.section} data-testid="backup">
      <summary className="acc-summary">
        <h2 id="backup-title" className={styles.title}>
          Sauvegarde
        </h2>
      </summary>

      <p className={styles.hint}>
        Vos traces sont stockées dans ce navigateur, et nulle part ailleurs :
        elles ne suivent pas sur votre téléphone, et vider les données du site
        les efface. Un fichier de sauvegarde est la seule copie qui vous
        appartienne — gardez-le où vous voulez.
      </p>

      {stockage && (
        <p className={styles.stockage} data-testid="stockage-etat">
          {stockage.octetsUtilises === null
            ? 'Ce navigateur ne dit pas combien de place vos données occupent.'
            : `${formatOctets(stockage.octetsUtilises)} occupés par vos données.`}{' '}
          {stockage.persistant === true
            ? 'Le navigateur s’est engagé à ne pas les effacer pour faire de la place.'
            : stockage.persistant === false
              ? 'Le navigateur ne s’est pas engagé à les conserver : il peut les effacer pour faire de la place.'
              : 'Ce navigateur ne dit pas s’il s’engage à les conserver.'}
        </p>
      )}

      {webkit && (
        <p className={styles.avertissement} data-testid="stockage-webkit">
          Sur iPhone, iPad et Safari, les données d’un site peuvent être
          effacées après sept jours sans visite. Exportez une sauvegarde&nbsp;:
          c’est la seule copie qui ne dépende pas du navigateur.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          data-testid="backup-export"
          disabled={!aQuelqueChose || enCours}
          onClick={() => {
            setEnCours(true)
            void exporterSauvegarde().finally(() => {
              setEnCours(false)
            })
          }}
        >
          Enregistrer une sauvegarde
        </button>
        <button
          type="button"
          className={styles.action}
          data-testid="backup-import"
          disabled={enCours}
          onClick={() => inputRef.current?.click()}
        >
          Restaurer une sauvegarde
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gz,.json,application/gzip,application/json"
        hidden
        data-testid="backup-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setEnCours(true)
          void importerSauvegarde(file).finally(() => {
            setEnCours(false)
          })
        }}
      />

      {!aQuelqueChose && (
        <p className={styles.hint} data-testid="backup-empty">
          Rien à sauvegarder pour l’instant : importez d’abord une trace.
        </p>
      )}

      <p className={styles.hint}>
        Restaurer <strong>ajoute</strong> sans remplacer : une sortie déjà
        présente est reconnue à son tracé et ignorée, même sous un autre nom de
        fichier. Vous pouvez restaurer la même sauvegarde deux fois sans rien
        dupliquer.
      </p>

      {backupMessage && (
        <p
          className={styles.message}
          role="status"
          aria-live="polite"
          data-testid="backup-message"
        >
          {backupMessage}
          <button
            type="button"
            className="btn-icon-close"
            aria-label="Masquer ce message"
            onClick={clearBackupMessage}
          >
            ×
          </button>
        </p>
      )}
    </details>
  )
}
