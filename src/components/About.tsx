import { useEffect, useRef } from 'react'
import styles from './About.module.css'

/** Page À propos : licences, marques, engagement privacy. */
export function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="about-title"
      data-testid="about-dialog"
      onClose={onClose}
      onClick={(event) => {
        // Clic sur le fond (backdrop) : fermer.
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className={styles.content}>
        <header className={styles.header}>
          <span className="balise" aria-hidden="true">
            <span />
            <span />
          </span>
          <h2 id="about-title">À propos de Sentiers</h2>
          <button
            type="button"
            className="btn-icon-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <section>
          <h3>Vos données restent chez vous</h3>
          <p>
            Vos traces GPX sont lues et analysées <strong>uniquement dans
            votre navigateur</strong>, et stockées localement (IndexedDB).
            Aucune trace, aucun identifiant, aucune mesure d’audience ne quitte
            votre appareil. Il n’y a ni compte, ni serveur applicatif.
          </p>
        </section>

        <section>
          <h3>Données et licences</h3>
          <ul>
            <li>
              Les tracés d’itinéraires proviennent d’
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>{' '}
              (© les contributeurs OpenStreetMap), sous licence{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/"
                target="_blank"
                rel="noreferrer"
              >
                ODbL
              </a>
              , via l’API Overpass.
            </li>
            <li>
              Les <strong>boucles locales</strong> de la Métropole de Lyon
              proviennent du jeu de données ouvert «&nbsp;Boucles communales de
              randonnée&nbsp;» (©&nbsp;
              <a
                href="https://data.grandlyon.com/"
                target="_blank"
                rel="noreferrer"
              >
                Métropole de Lyon
              </a>
              , Licence Ouverte 2.0).
            </li>
            <li>
              Le fond de carte est le <strong>Plan IGN v2</strong> (© IGN),
              diffusé par la Géoplateforme sous{' '}
              <a
                href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/"
                target="_blank"
                rel="noreferrer"
              >
                licence ouverte Etalab 2.0
              </a>
              , avec repli sur les tuiles OpenStreetMap.
            </li>
          </ul>
        </section>

        <section>
          <h3>Marques</h3>
          <p>
            GR®, GR de Pays® et PR® sont des marques de la FFRandonnée. Cette
            application est indépendante et fondée sur les données
            OpenStreetMap.
          </p>
        </section>

        <section>
          <h3>Prudence sur les sentiers</h3>
          <p>
            Les tracés affichés sont issus de contributions bénévoles et
            peuvent être incomplets ou datés. Sentiers est un outil de suivi,
            pas un outil de navigation : sur le terrain, emportez une carte à
            jour ou un topoguide, et adaptez vos sorties à la météo et à votre
            niveau.
          </p>
        </section>

        <section>
          <h3>Comment est calculée la progression ?</h3>
          <p>
            Chaque itinéraire est échantillonné tous les 100 mètres ; un point
            est « parcouru » si l’une de vos traces passe à moins de la
            tolérance choisie (50 m par défaut). La progression est le rapport
            des points parcourus sur l’ensemble, converti en kilomètres.
          </p>
        </section>
      </div>
    </dialog>
  )
}
