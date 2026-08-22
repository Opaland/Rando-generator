/**
 * Le prototype de navigation par onglets (issue #171), et rien de plus.
 *
 * #177 interdit d'industrialiser cette refonte avant la session E2 : c'est
 * la plus lourde du backlog, fondée sur une hypothèse de conception, et la
 * corriger après coup coûterait le lot entier.
 *
 * Mais une session ne se conduit pas sur une maquette d'image : il faut
 * quelque chose qui s'utilise. Sans prototype, l'issue attend un test qui
 * attend l'issue. Ce module tient donc les deux bouts — le découpage est
 * écrit et éprouvé, et il ne s'active que si on le demande explicitement.
 *
 * Par défaut, l'application ne bouge pas d'un pixel.
 */

export type Onglet = 'carte' | 'sorties' | 'progression' | 'reglages'

/**
 * Les sections telles qu'`App.tsx` les empile aujourd'hui. Le prototype les
 * **ré-adresse**, il ne les réécrit pas : c'est ce qui rend le lot tenable,
 * et ce qui garantit qu'E2 juge la navigation, pas une réimplémentation.
 */
export type SectionApp =
  | 'zone'
  | 'traces'
  | 'itinerairesPerso'
  | 'tableauDeBord'
  | 'objectifs'
  | 'prochaineSortie'
  | 'historique'
  | 'listeItineraires'
  | 'reglages'
  | 'sauvegarde'

export interface DefinitionOnglet {
  cle: Onglet
  libelle: string
  /** Icône **et** libellé : une icône seule se devine, et se devine mal. */
  icone: string
}

/*
 * Un champ `intention` a existé ici, portant la question à laquelle chaque
 * onglet répond — « où vais-je, que me reste-t-il ». Rien ne le lisait :
 * une donnée qu'aucun rendu ne consulte finit par mentir, et celle-ci
 * affirmait en plus décider du rangement, ce qu'elle ne faisait pas.
 * Retiré à la revue du sprint 5. Les intentions vivent dans l'issue #171 et
 * dans le commentaire ci-dessus, où elles n'ont rien à prouver.
 */

export const ONGLETS: DefinitionOnglet[] = [
  {
    cle: 'carte',
    libelle: 'Carte',
    icone: '🗺️',
  },
  {
    cle: 'sorties',
    libelle: 'Sorties',
    icone: '👟',
  },
  {
    cle: 'progression',
    libelle: 'Progression',
    icone: '📈',
  },
  {
    cle: 'reglages',
    libelle: 'Réglages',
    icone: '⚙️',
  },
]

/**
 * Au-delà de quatre sections, l'onglet redevient le mur qu'on voulait
 * défaire — le risque que l'issue écrit noir sur blanc. Seuil de
 * présentation, tranché au jugement et vérifié par un test plutôt que laissé
 * à la vigilance.
 */
const MAX_SECTIONS_PAR_ONGLET = 4

/**
 * Le rangement suit la table de l'issue partout où elle se prononce. Elle
 * ne se prononce pas sur deux sections — `ZonePicker` et
 * `CustomItineraries` n'y figurent pas — et ces deux-là sont donc placées
 * au jugement, ce qui est exactement le genre de choix qu'une session doit
 * trancher plutôt qu'un développeur seul.
 *
 * - `zone` va sous **Carte** : choisir sa zone, c'est choisir ce que la
 *   carte montre. C'est la seule section que Carte porte, l'onglet reste
 *   donc « plein cadre » au sens de l'issue.
 * - `itinerairesPerso` va sous **Sorties** : importer ses propres tracés
 *   cibles est un geste d'entrée de données, voisin de l'import de traces,
 *   même si l'objet produit est une cible et non une sortie. C'est le
 *   placement dont je suis le moins sûr, et il est posé comme question dans
 *   la fiche de session.
 */
const RANGEMENT: Record<Onglet, SectionApp[]> = {
  carte: ['zone'],
  sorties: ['traces', 'itinerairesPerso', 'historique', 'sauvegarde'],
  progression: [
    'tableauDeBord',
    'objectifs',
    'prochaineSortie',
    'listeItineraires',
  ],
  reglages: ['reglages'],
}

export function sectionsDeLOnglet(onglet: Onglet): SectionApp[] {
  return RANGEMENT[onglet]
}

export { MAX_SECTIONS_PAR_ONGLET }

/**
 * Le prototype ne s'active que sur `?maquette=onglets`, exactement.
 *
 * La comparaison est stricte à dessein : un prototype qui s'activerait par
 * erreur pendant une session la fausserait sans que personne s'en aperçoive,
 * et E2 conclurait sur la mauvaise version.
 */
export function maquetteDemandee(recherche: string): boolean {
  try {
    return new URLSearchParams(recherche).get('maquette') === 'onglets'
  } catch {
    return false
  }
}
