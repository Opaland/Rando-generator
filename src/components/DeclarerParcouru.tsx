import { useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import styles from './DeclarerParcouru.module.css'

/**
 * « Je l'ai fait » — cocher un itinéraire sans trace GPX (issue #158).
 *
 * Sylvie n'a aucun fichier : ses quinze PR sont dans sa tête. Sans ce bouton,
 * l'application lui reste inutilisable de bout en bout — et c'est le profil
 * le plus nombreux.
 *
 * Ce que ce composant ne fait **pas**, et c'est le point délicat de l'issue :
 * il ne touche pas au pourcentage mesuré. Ce qui est coché ici est rangé à
 * côté du matching, jamais dedans ; le tableau de bord l'affiche en toutes
 * lettres comme un chiffre d'une autre nature.
 *
 * La date est facultative, et « je ne sais plus quand » est une réponse
 * complète, pas une donnée manquante : c'est pour cela qu'on peut valider
 * sans rien saisir.
 */
export function DeclarerParcouru({ itineraryId }: { itineraryId: number }) {
  const parcoursDeclares = useAppStore((s) => s.parcoursDeclares)
  const declarer = useAppStore((s) => s.declarerParcours)
  const retirer = useAppStore((s) => s.retirerParcoursDeclare)
  const [saisieOuverte, setSaisieOuverte] = useState(false)
  const [date, setDate] = useState('')

  const declaration = parcoursDeclares.find(
    (d) => d.itineraryId === itineraryId,
  )

  if (declaration) {
    const quand = declaration.date
      ? new Date(declaration.date).toLocaleDateString('fr-FR')
      : null
    return (
      <div className={styles.bloc} data-testid="declare-etat">
        <p className={styles.fait}>
          <strong>Vous avez déclaré avoir fait cet itinéraire</strong>
          {quand ? ` le ${quand}` : ''}.
        </p>
        <p className={styles.aide}>
          Déclaré, pas mesuré : ce parcours n’entre pas dans votre pourcentage
          et n’apparaît pas dans les tronçons restants.
        </p>
        <button
          type="button"
          className="btn-link"
          data-testid="declare-retirer"
          onClick={() => {
            void retirer(itineraryId)
          }}
        >
          Retirer cette déclaration
        </button>
      </div>
    )
  }

  if (!saisieOuverte) {
    return (
      <div className={styles.bloc}>
        <button
          type="button"
          className="btn-secondary"
          data-testid="declare-ouvrir"
          onClick={() => {
            setSaisieOuverte(true)
          }}
        >
          Je l’ai déjà fait
        </button>
        <p className={styles.aide}>
          Sans trace GPX. Ce sera compté à part de votre pourcentage mesuré.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.bloc}>
      <label className={styles.champ} htmlFor="declare-date">
        Quand, à peu près ? (facultatif)
      </label>
      <input
        id="declare-date"
        type="date"
        className={styles.date}
        data-testid="declare-date"
        value={date}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => {
          setDate(e.target.value)
        }}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className="btn-primary"
          data-testid="declare-valider"
          onClick={() => {
            void declarer(itineraryId, date === '' ? null : date)
            setSaisieOuverte(false)
          }}
        >
          {date === '' ? 'Valider sans date' : 'Valider'}
        </button>
        <button
          type="button"
          className="btn-link"
          data-testid="declare-annuler"
          onClick={() => {
            setSaisieOuverte(false)
            setDate('')
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
