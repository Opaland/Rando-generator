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
    // Déplié d'emblée (#576, 21/10) : replié, le gros texte demandait un
    // geste qu'on ne devine pas, à la personne qui en a le plus besoin.
    <details className={styles.section} data-testid="mode-affichage" open>
      <summary className="acc-summary">
        <h2 className={styles.title} data-testid="affichage-title">
          Affichage
        </h2>
      </summary>

      {/* Le gros texte d'abord : c'est lui qu'on vient chercher quand on lit
          mal, et placé après les deux modes il tombait sous le bas visible
          de la feuille au téléphone (#576, 21/10). */}
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
    </details>
  )
}
