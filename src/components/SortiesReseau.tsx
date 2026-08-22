import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import {
  resumerJournal,
  libelleDestination,
} from '../core/journalSortant.ts'
import styles from './SortiesReseau.module.css'

/**
 * Montrer ce qui sort, au lieu de répéter que rien ne sort (issue #178).
 *
 * La promesse de Sentiers est écrite partout et prouvée nulle part. Ce
 * panneau la remplace par trois choses vérifiables : un chiffre, sa
 * décomposition par service, et la place des traces là-dedans — aucune.
 *
 * Ce qu'il ne dit pas est aussi important. Il ne prétend pas compter
 * « tout le trafic » : il compte les requêtes que l'application émet par
 * `fetch` et `XMLHttpRequest`, ce que l'instrumentation couvre réellement.
 * Les ressources chargées par le navigateur lui-même — images de la page,
 * polices — n'y passent pas, et le panneau ne fait pas semblant de les
 * voir.
 */
export function SortiesReseau() {
  const sorties = useAppStore((s) => s.sortiesReseau)
  const tracks = useAppStore((s) => s.tracks)
  const resume = useMemo(() => resumerJournal(sorties), [sorties])

  return (
    <section className={styles.bloc} data-testid="sorties-reseau">
      <h3>Ce qui est sorti d’ici depuis l’ouverture</h3>

      <p className={styles.chiffre}>
        <strong data-testid="sorties-total">{resume.total}</strong>{' '}
        {resume.total === 1 ? 'requête envoyée' : 'requêtes envoyées'}
        {tracks.length > 0 && (
          <>
            {' · '}
            <strong data-testid="sorties-traces">0</strong> contenait{' '}
            {tracks.length === 1 ? 'votre trace' : 'vos traces'}
          </>
        )}
      </p>

      {resume.total === 0 ? (
        <p className={styles.rien}>
          Rien n’est encore parti. Charger une zone ou afficher la carte fera
          apparaître des lignes ici.
        </p>
      ) : (
        <ul className={styles.liste}>
          {resume.parDestination.map((groupe) => (
            <li key={groupe.destination}>
              <span className={styles.nom}>
                {libelleDestination(groupe.destination)}
              </span>
              <span className={styles.hotes}>{groupe.hotes.join(', ')}</span>
              <span className={styles.nombre}>{groupe.nombre}</span>
            </li>
          ))}
        </ul>
      )}

      {resume.inconnues.length > 0 && (
        <p
          className={styles.inconnue}
          role="alert"
          data-testid="sorties-inconnues"
        >
          {resume.inconnues.length === 1
            ? 'Une destination n’est pas répertoriée dans cette page : '
            : 'Des destinations ne sont pas répertoriées dans cette page : '}
          <strong>{resume.inconnues.join(', ')}</strong>. Si vous voyez ceci,
          l’inventaire ci-dessus est incomplet — c’est un défaut, et il mérite
          d’être signalé.
        </p>
      )}

      <p className={styles.note}>
        Ce compteur porte sur les requêtes émises par l’application. Vos
        traces ne figurent dans aucune d’elles&nbsp;: aucun chemin du code ne
        les envoie, et un test le vérifie à chaque livraison.
      </p>
    </section>
  )
}
