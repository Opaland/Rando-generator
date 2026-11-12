import { useEffect, useRef } from 'react'
import styles from './About.module.css'
import { SortiesReseau } from './SortiesReseau.tsx'
import { CeQuiSort } from './CeQuiSort.tsx'
import { DonneesEtLicences } from './DonneesEtLicences.tsx'

/** Page À propos : licences, marques, engagement privacy. */
export function About({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
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

        <section data-testid="about-local">
          <h3>Vos traces restent chez vous</h3>
          <p>
            Vos traces — GPX, FIT, TCX — sont lues et analysées{' '}
            <strong>uniquement dans votre navigateur</strong>, et stockées
            localement — les traces et les points d’intérêt emportés dans
            IndexedDB, les cartes emportées dans le cache du navigateur, vos
            réglages dans le stockage local. Le calcul de complétion se fait chez vous,
            de bout en bout. Aucune trace, aucun identifiant, aucune mesure
            d’audience ne quitte votre appareil. Il n’y a ni compte, ni serveur
            applicatif.
          </p>
          <p>
            C’est vrai aussi — et surtout — d’une{' '}
            <strong>sortie que vous enregistrez</strong>. Pendant
            l’enregistrement, votre position est relevée toutes les quelques
            secondes et écrite dans le stockage de votre navigateur, pour qu’une
            sortie survive à un onglet fermé. Gardez l’écran allumé&nbsp;: sur
            certains téléphones, dont Android, un écran verrouillé suspend la
            localisation, et le chemin fait pendant ce temps n’est pas compté.
            <strong> Elle n’est envoyée à personne</strong>, ni pendant, ni
            après. Aucun serveur n’est contacté pour enregistrer, et il n’y a
            rien à désactiver pour que ce soit vrai&nbsp;: il n’existe pas de
            code qui le ferait.
          </p>
          <p>
            C’est vrai de vos traces, de vos réglages, de vos objectifs et de
            votre historique. Ce n’est pas vrai de tout&nbsp;: afficher une
            carte, c’est demander des images à quelqu’un. Le détail est juste
            en&nbsp;dessous, et il vaut mieux le lire que le deviner.
          </p>
          <p>
            Ce choix a un prix, et il est juste de l’annoncer :{' '}
            <strong>vos données ne suivent pas d’un appareil à l’autre</strong>,
            et vider les données du site les efface définitivement. La section
            «&nbsp;Sauvegarde&nbsp;» écrit un fichier que vous gardez où vous
            voulez, et qui se relit ici ou sur un autre appareil.
          </p>
        </section>

        <SortiesReseau ouvert={open} />

        <CeQuiSort />

        <DonneesEtLicences />

        <section>
          <h3>GR, GR de Pays, PR : qu’est-ce que c’est&nbsp;?</h3>
          <p>
            Ce sont les trois familles d’itinéraires balisés par la FFRandonnée
            et ses comités, reconnaissables à leurs marques peintes sur les
            arbres, les rochers et les poteaux&nbsp;:
          </p>
          <ul>
            <li>
              <strong>GR — Grande Randonnée</strong> (balisage blanc et
              rouge)&nbsp;: les grands itinéraires, souvent sur plusieurs jours,
              parfois plusieurs semaines. Le GR 7 traverse la France des Vosges
              aux Pyrénées.
            </li>
            <li>
              <strong>GR de Pays</strong> (jaune et rouge)&nbsp;: une boucle
              régionale de quelques jours, qui fait le tour d’un massif ou d’un
              pays.
            </li>
            <li>
              <strong>PR — Promenade et Randonnée</strong> (jaune)&nbsp;: un
              circuit local, en général de deux à six heures. C’est la balade du
              dimanche.
            </li>
          </ul>
          <p>
            S’y ajoutent les <strong>itinéraires internationaux</strong> —
            Compostelle, Via Alpina, sentiers européens — qu’OpenStreetMap
            déclare à part&nbsp;: ils traversent plusieurs pays, et leur
            balisage change avec eux, donc Sentiers n’en promet aucun. Puis les{' '}
            <strong>boucles locales</strong> publiées en données ouvertes par
            des collectivités, et vos <strong>itinéraires personnels</strong> —
            importés ou tracés ici.
          </p>
          <p>
            Le{' '}
            <strong>
              balisage affiché vient du tag <code>osmc:symbol</code>
            </strong>
            , qui décrit la marque réellement peinte sur l’arbre — et non d’une
            référence commençant par «&nbsp;GR&nbsp;». Ce tag est{' '}
            <strong>très inégal selon les massifs</strong>&nbsp;: quand il
            manque, la ligne
            «&nbsp;Balisé&nbsp;» n’apparaît pas, plutôt que d’annoncer une
            marque approximative à quelqu’un qui la cherchera sur un poteau.
          </p>
          <p>
            De même, le <strong>sol</strong> et l’<strong>eau</strong> se
            filtrent par ce qu’OpenStreetMap dit, jamais par un jugement&nbsp;:
            «&nbsp;entièrement dur ou stabilisé&nbsp;» et non
            «&nbsp;accessible&nbsp;», un <strong>détour en mètres</strong> et
            non «&nbsp;avec de l’eau&nbsp;». Un point d’eau absent de la carte
            ne veut pas dire qu’il n’y en a pas&nbsp;: il veut dire que personne
            ne l’a saisi.
          </p>
          <p>
            Enfin, une partie des itinéraires d’OpenStreetMap{' '}
            <strong>ne déclare aucun réseau</strong>. Sentiers les affiche à
            part, sous le nom «&nbsp;réseau non déclaré&nbsp;», plutôt que de
            les ranger d’office parmi les PR&nbsp;: ce peut être un circuit
            balisé que personne n’a qualifié, comme un tracé qui n’a jamais
            porté la moindre marque sur un arbre. La différence se voit sur le
            terrain, et l’application n’est pas en mesure de la trancher à votre
            place.
          </p>
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
            Les tracés affichés sont issus de contributions bénévoles et peuvent
            être incomplets ou datés. Sentiers est un outil de suivi, pas un
            outil de navigation : sur le terrain, emportez une carte à jour ou
            un topoguide, et adaptez vos sorties à la météo et à votre niveau.
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
          <p>
            Trois règles évitent de compter ce qui n’a pas été marché&nbsp;: un
            passage ne compte qu’à partir de trois points consécutifs, environ
            300&nbsp;m — couper un sentier n’est pas le parcourir&nbsp;; au moins
            un quart de ces points doit être frôlé, à moins de 40&nbsp;% de la
            tolérance — longer un sentier à distance ne suffit pas&nbsp;; et ce
            qui est parcouru à plus de 28,5&nbsp;km/h, en voiture par exemple,
            ne compte pas.
          </p>
        </section>
      </div>
    </dialog>
  )
}
