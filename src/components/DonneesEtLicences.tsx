/**
 * « Données et licences », la section d'« À propos » qui crédite chaque
 * source par son nom et sa licence.
 *
 * Sortie d'`About.tsx` le 18/10 quand le PDIPR de l'Isère (#87) l'a portée
 * à 342 lignes pour un plafond de 325 : une entrée par source est une
 * obligation de licence, pas du texte qu'on resserre. C'est la réponse
 * honnête que nomme `plafondDesComposants.test.ts` — un sous-composant
 * cohérent plutôt qu'un plafond relevé.
 */
export function DonneesEtLicences() {
  return (
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
          de la Base Adresse Nationale (© Etalab, Licence Ouverte 2.0). Seul le
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
          Le <strong>GR Nord</strong> (Nouvelle-Calédonie) provient du jeu
          ouvert «&nbsp;GR Province Nord&nbsp;» (©&nbsp;
          <a
            href="https://data.gouv.nc/explore/dataset/gr-province-nord/"
            target="_blank"
            rel="noreferrer"
          >
            Province Nord
          </a>
          , Licence Ouverte 2.0).
        </li>
        <li>
          En Isère, le <strong>réseau balisé du Département</strong> (son
          plan des itinéraires de promenade et de randonnée, ©&nbsp;
          <a
            href="https://opendata.isere.fr/explore/dataset/plan-departemental-des-itineraires-de-promenades-et-de-randonnees-departement-de/"
            target="_blank"
            rel="noreferrer"
          >
            Département de l’Isère
          </a>
          , Licence Ouverte 2.0) est dessiné en fond, en gris&nbsp;: ses
          tronçons ne portent ni nom ni numéro, ils ne se suivent donc pas
          et ne comptent dans aucun pourcentage. Ceux de Grenoble-Alpes
          Métropole n’y sont pas&nbsp;: le jeu publié les place au large
          de l’Afrique.
        </li>
        <li>
          Dans l’Ain, les <strong>boucles du Département</strong> (son plan
          des itinéraires de promenade et de randonnée, ©&nbsp;
          <a
            href="https://www.data.gouv.fr/datasets/pdipr-itineraire"
            target="_blank"
            rel="noreferrer"
          >
            Département de l’Ain
          </a>
          , Licence Ouverte 2.0) sont dessinées en fond, de la même
          façon&nbsp;: elles portent un nom, mais une partie d’entre elles
          existe déjà dans OpenStreetMap, et elles ne comptent dans aucun
          pourcentage tant qu’on ne sait pas les distinguer.
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
  )
}
