import { DEPARTEMENT_AIN, DEPARTEMENT_ISERE, DEPARTEMENT_RHONE } from '../lib/attribution.ts'

/**
 * Les PDIPR départementaux dans « Données et licences » (#87) : un par
 * département, dessinés en fond sans compter.
 *
 * Sortis de `DonneesEtLicences.tsx` le 09/11, quand le Rhône l'a porté à
 * 134 lignes pour un plafond de 120 — la même réponse qu'au 18/10 : un
 * sous-composant cohérent plutôt qu'un plafond relevé. Le lien, le nom et la
 * licence viennent du crédit de la carte (`lib/attribution.ts`) : écrits une
 * seconde fois ici, ils divergeraient (CLAUDE.md §4ter).
 */
interface CreditDepartemental {
  readonly qui: string
  readonly licence?: string
  readonly lien: string
}

function Producteur({ credit }: { credit: CreditDepartemental }) {
  return (
    <>
      ©&nbsp;
      <a href={credit.lien} target="_blank" rel="noreferrer">
        {credit.qui.replace("'", '’')}
      </a>
      {credit.licence ? `, ${credit.licence}` : ''}
    </>
  )
}

const PLAN = 'son plan des itinéraires de promenade et de randonnée'

export function ReseauxDepartementaux() {
  return (
    <>
      <li>
        En Isère, le <strong>réseau balisé du Département</strong> ({PLAN},{' '}
        <Producteur credit={DEPARTEMENT_ISERE} />) est dessiné en fond, en
        gris&nbsp;: ses tronçons ne portent ni nom ni numéro, ils ne se suivent
        donc pas et ne comptent dans aucun pourcentage. Ceux de Grenoble-Alpes
        Métropole n’y sont pas&nbsp;: le jeu publié les place au large de
        l’Afrique.
      </li>
      <li>
        Dans l’Ain, les <strong>boucles du Département</strong> ({PLAN},{' '}
        <Producteur credit={DEPARTEMENT_AIN} />) sont dessinées en fond, de la
        même façon&nbsp;: elles portent un nom, mais une partie d’entre elles
        existe déjà dans OpenStreetMap, et elles ne comptent dans aucun
        pourcentage tant qu’on ne sait pas les distinguer.
      </li>
      <li>
        Dans le Rhône, le <strong>réseau balisé du Département</strong> ({PLAN},{' '}
        <Producteur credit={DEPARTEMENT_RHONE} />) est dessiné en fond comme
        celui de l’Isère&nbsp;: des tronçons sans nom, qui ne comptent dans
        aucun pourcentage.
      </li>
    </>
  )
}
