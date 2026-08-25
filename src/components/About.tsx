import { useEffect, useRef } from 'react'
import styles from './About.module.css'
import { SortiesReseau } from './SortiesReseau.tsx'

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
            Vos traces GPX sont lues et analysées{' '}
            <strong>uniquement dans votre navigateur</strong>, et stockées
            localement — les traces et les cartes dans IndexedDB, vos réglages
            dans le stockage local. Le calcul de complétion se fait chez vous,
            de bout en bout. Aucune trace, aucun identifiant, aucune mesure
            d’audience ne quitte votre appareil. Il n’y a ni compte, ni serveur
            applicatif.
          </p>
          <p>
            C’est vrai aussi — et surtout — d’une{' '}
            <strong>sortie que vous enregistrez</strong>. Pendant
            l’enregistrement, votre position est relevée toutes les quelques
            secondes et écrite dans le stockage de votre navigateur, pour qu’une
            sortie survive à un écran verrouillé ou à un onglet fermé.
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

        <SortiesReseau />

        <section data-testid="about-sortant">
          <h3>Ce qui sort de votre appareil, et pour qui</h3>
          <p>
            Sentiers n’a pas de serveur, mais il interroge des services publics
            tiers pour faire son travail. Ces services voient donc passer
            quelque chose. Ce n’est pas un aveu&nbsp;: c’est le fonctionnement
            normal d’une application cartographique sans serveur, et il vaut
            mieux le nommer que le laisser supposer.
          </p>
          <ul>
            <li>
              <strong>Overpass</strong> (overpass-api.de, avec un miroir chez
              kumi.systems) reçoit la <strong>zone demandée</strong>, la{' '}
              <strong>référence tapée</strong> («&nbsp;GR&nbsp;7&nbsp;») ou un{' '}
              <strong>rayon autour d’un point</strong>, quand vous chargez une
              zone ou lancez une recherche. C’est de là que viennent les tracés.
            </li>
            <li>
              La <strong>Géoplateforme IGN</strong> reçoit les{' '}
              <strong>coordonnées des tuiles que vous regardez</strong>, en
              continu tant que la carte est affichée. Autrement dit&nbsp;: où
              vous préparez vos sorties.
            </li>
            <li>
              <strong>OpenStreetMap</strong> reçoit la même chose, mais
              seulement en <strong>repli</strong>, si le fond IGN ne répond pas.
            </li>
            <li>
              Le service d’<strong>altimétrie</strong> de la Géoplateforme IGN
              reçoit{' '}
              <strong>
                jusqu’à cent points de l’itinéraire dont vous ouvrez le profil
              </strong>{' '}
              — assez pour savoir précisément lequel c’est. Cela vaut aussi pour
              un itinéraire que vous avez <strong>importé</strong> dans
              «&nbsp;Mes itinéraires&nbsp;», et pour un parcours que vous tracez
              à la main. Vos <strong>sorties</strong>, elles, ne partent jamais.
            </li>
            <li>
              L’<strong>API Adresse</strong> (Base Adresse Nationale) reçoit le{' '}
              <strong>nom de commune que vous tapez</strong>, et rien d’autre —
              ni vos traces, ni votre position.
            </li>
            <li>
              Enfin, le site est servi par <strong>GitHub Pages</strong>, qui
              voit passer la demande de la page et de ses fichiers, comme tout
              hébergeur. Nous n’y avons ni compte utilisateur ni mesure
              d’audience, mais nous ne pouvons pas prétendre que personne ne
              sait que vous êtes venu.
            </li>
          </ul>
          <p>
            Votre <strong>position GPS</strong>, quand vous l’activez, reste
            dans le navigateur&nbsp;: elle sert à vous placer sur la carte et
            n’est envoyée à aucun de ces services.
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
              La <strong>recherche par nom de ville</strong> interroge l’
              <a
                href="https://adresse.data.gouv.fr/"
                target="_blank"
                rel="noreferrer"
              >
                API Adresse
              </a>{' '}
              de la Base Adresse Nationale (© Etalab, Licence Ouverte). Seul le
              texte que vous tapez est transmis&nbsp;: ni vos traces, ni votre
              position.
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
            S’y ajoutent les <strong>boucles locales</strong> publiées en
            données ouvertes par des collectivités, et vos{' '}
            <strong>itinéraires personnels</strong> — importés ou tracés ici.
          </p>
          <p>
            Le{' '}
            <strong>
              balisage affiché vient du tag <code>osmc:symbol</code>
            </strong>
            , qui décrit la marque réellement peinte sur l’arbre — et non d’une
            référence commençant par «&nbsp;GR&nbsp;». Ce tag est{' '}
            <strong>rare</strong>&nbsp;: quand il manque, la ligne
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
        </section>
      </div>
    </dialog>
  )
}
