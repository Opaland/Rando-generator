import { useAppStore } from '../store/appStore.ts'
import { MODES_AFFICHAGE } from '../core/affichage.ts'
import styles from './ModeSwitch.module.css'

/**
 * Le choix du registre d'affichage (issue #173).
 *
 * Il reste visible dans les deux modes, et c'est délibéré : un mode simple
 * dont on ne peut pas sortir est un piège, pas une aide. C'est aussi ce qui
 * permet à quelqu'un d'installer le mode pour un proche puis de le rendre.
 */
export function ModeSwitch() {
  const modeAffichage = useAppStore((s) => s.modeAffichage)
  const setModeAffichage = useAppStore((s) => s.setModeAffichage)
  const grosTexte = useAppStore((s) => s.grosTexte)
  const setGrosTexte = useAppStore((s) => s.setGrosTexte)

  return (
    <details className={styles.section} data-testid="mode-affichage">
      <summary className="acc-summary">
        <h2 className={styles.title}>Affichage</h2>
      </summary>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Ce qui est à l’écran</legend>
        <div className={styles.modes}>
          {MODES_AFFICHAGE.map((mode) => (
            <label key={mode.id} className={styles.mode}>
              <input
                type="radio"
                name="mode-affichage"
                value={mode.id}
                checked={modeAffichage === mode.id}
                data-testid={`mode-${mode.id}`}
                onChange={() => {
                  void setModeAffichage(mode.id)
                }}
              />
              <span>
                <span className={styles.modeNom}>{mode.libelle}</span>
                <span className={styles.modeTexte}>{mode.explication}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.bascule}>
        <input
          type="checkbox"
          checked={grosTexte}
          data-testid="gros-texte"
          onChange={(e) => {
            void setGrosTexte(e.target.checked)
          }}
        />
        <span>
          <span className={styles.modeNom}>Gros texte et contrastes</span>
          <span className={styles.modeTexte}>
            Agrandit tout, y compris les libellés portés par la carte, et
            renforce les contrastes.
          </span>
        </span>
      </label>
    </details>
  )
}
