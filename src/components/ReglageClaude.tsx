import { useState } from 'react'
import { useCleClaude } from '../store/cleClaude.ts'
import styles from './ReglageClaude.module.css'

/**
 * Le réglage de Claude, dans Réglages (issue #673) : désactivé tant
 * qu'aucune clé n'est collée. La clé n'est jamais réaffichée : on peut
 * l'oublier, pas la relire.
 */
export function ReglageClaude() {
  const cle = useCleClaude((s) => s.cle)
  const gardee = useCleClaude((s) => s.gardee)
  const poser = useCleClaude((s) => s.poser)
  const oublier = useCleClaude((s) => s.oublier)
  const [saisie, setSaisie] = useState('')
  const [garder, setGarder] = useState(false)

  return (
    <fieldset className={styles.bloc} data-testid="reglage-claude">
      <legend className={styles.titre}>Claude (facultatif)</legend>
      <p className={styles.aide}>
        Avec votre propre clé d’API Anthropic, Claude peut écrire le bilan
        de votre saison ou raconter une sortie. Ne partent que des totaux et
        des noms publics — kilomètres, dénivelé, zones prédéfinies traversées,
        itinéraires balisés —, jamais une trace, une position
        ni le nom de vos fichiers, et seulement quand vous le demandez. Le
        coût, quelques centimes par texte, est à votre charge.
      </p>
      {cle ? (
        <div className={styles.ligne}>
          <span data-testid="claude-etat">
            Clé posée{gardee ? ', gardée sur cet appareil' : ' pour cet onglet'}.
          </span>
          <button type="button" onClick={oublier} data-testid="claude-oublier">
            Oublier la clé
          </button>
        </div>
      ) : (
        <form
          className={styles.formulaire}
          onSubmit={(e) => {
            e.preventDefault()
            poser(saisie, garder)
            setSaisie('')
          }}
        >
          <label className={styles.champ}>
            Clé d’API Anthropic
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={saisie}
              onChange={(e) => {
                setSaisie(e.target.value)
              }}
              data-testid="claude-cle"
            />
          </label>
          <label className={styles.case}>
            <input
              type="checkbox"
              checked={garder}
              onChange={(e) => {
                setGarder(e.target.checked)
              }}
              data-testid="claude-garder"
            />
            La garder sur cet appareil. Les autres sites publiés à la même
            adresse (opaland.github.io) pourraient la lire : sans cette case,
            elle est oubliée à la fermeture de l’onglet.
          </label>
          <button type="submit" disabled={!saisie.trim()} data-testid="claude-poser">
            Utiliser cette clé
          </button>
        </form>
      )}
    </fieldset>
  )
}
