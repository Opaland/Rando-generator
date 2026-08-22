import { ONGLETS, type Onglet } from '../core/maquetteOnglets.ts'
import styles from './BarreOnglets.module.css'

/**
 * Prototype de navigation par onglets (issue #171), servi uniquement sur
 * `?maquette=onglets` pour la session E2 — voir `core/maquetteOnglets.ts`.
 *
 * Icône **et** libellé : une icône seule se devine, et se devine mal. Les
 * cibles font 44 px de haut au minimum, et la barre réserve la zone sûre
 * iOS sous elle.
 */
export function BarreOnglets({
  actif,
  onChange,
}: {
  actif: Onglet
  onChange: (onglet: Onglet) => void
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
          </span>
          <span className={styles.libelle}>{onglet.libelle}</span>
        </button>
      ))}
    </nav>
  )
}
