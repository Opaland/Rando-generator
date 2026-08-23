import { ONGLETS, type Onglet } from '../core/maquetteOnglets.ts'
import styles from './BarreOnglets.module.css'

/**
 * Ce que dit le témoin de sortie, selon l'état — et il en dit toujours
 * quelque chose de complet : « Sorties » seul serait ambigu pour qui
 * navigue à la voix.
 */
const ANNONCE_SORTIE = {
  enregistrement: 'sortie en cours d’enregistrement',
  pause: 'sortie en pause',
} as const

/**
 * Navigation par onglets (issue #171), disposition par défaut sur téléphone
 * — voir `core/maquetteOnglets.ts`.
 *
 * Icône **et** libellé : une icône seule se devine, et se devine mal. Les
 * cibles font 44 px de haut au minimum, et la barre réserve la zone sûre
 * iOS sous elle.
 */
export function BarreOnglets({
  actif,
  onChange,
  sortie = null,
}: {
  actif: Onglet
  onChange: (onglet: Onglet) => void
  /**
   * L'état de la sortie en cours, ou `null`. La barre est la seule chose
   * toujours visible sur un téléphone : c'est donc ici que se dit qu'un
   * enregistrement tourne pendant qu'on regarde la carte. Sans cela, on
   * range son téléphone en croyant avoir terminé, et le GPS tourne jusqu'à
   * la nuit.
   */
  sortie?: 'enregistrement' | 'pause' | null
}) {
  return (
    <nav
      className={styles.barre}
      aria-label="Sections de l’application"
      data-testid="barre-onglets"
    >
      {ONGLETS.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          className={styles.onglet}
          aria-current={actif === onglet.cle ? 'page' : undefined}
          data-testid={`onglet-${onglet.cle}`}
          onClick={() => {
            onChange(onglet.cle)
          }}
        >
          <span className={styles.icone} aria-hidden="true">
            {onglet.icone}
            {onglet.cle === 'sorties' && sortie !== null && (
              <span
                className={`${styles.temoin} ${sortie === 'pause' ? styles.temoinPause : ''}`}
                data-testid="temoin-sortie"
                data-etat={sortie}
              />
            )}
          </span>
          <span className={styles.libelle}>{onglet.libelle}</span>
          {onglet.cle === 'sorties' && sortie !== null && (
            <span className="sr-only">{ANNONCE_SORTIE[sortie]}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
