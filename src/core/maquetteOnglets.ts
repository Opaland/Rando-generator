/**
 * La navigation par onglets (issue #171).
 *
 * Elle a d'abord vécu derrière un drapeau, parce que #177 interdisait de
 * l'industrialiser avant la session E2 — la refonte la plus lourde du
 * backlog, fondée sur une hypothèse de conception. C'est la disposition par
 * défaut depuis que Cédric a tranché de ne pas attendre la session.
 *
 * Ce que cela engage est écrit ici plutôt que perdu dans un historique :
 * l'hypothèse n'a pas été validée, elle a été adoptée. Les accordéons
 * restent servis par `?maquette=accordeons`, ce qui laisse E2 conduisible
 * et laisse un retour en arrière possible sans réécriture.
 */

export type Onglet = 'carte' | 'sorties' | 'progression' | 'reglages'

/**
 * Les sections telles qu'`App.tsx` les empile aujourd'hui. Le prototype les
 * **ré-adresse**, il ne les réécrit pas : c'est ce qui rend le lot tenable,
 * et ce qui garantit qu'E2 juge la navigation, pas une réimplémentation.
 */
export type SectionApp =
  | 'zone'
  | 'enregistrement'
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
 * - `enregistrement` ouvre **Sorties**, et c'est le seul placement qui se
 *   passe de discussion : l'onglet s'appelle « Sorties » et porte une
 *   chaussure. Enregistrer la sienne y arrive en premier, avant de gérer
 *   celles qui sont déjà là.
 * - `sauvegarde` a quitté **Sorties** pour **Réglages**. Deux raisons, dont
 *   une seule serait faible : exporter et réimporter sa base entière est un
 *   geste d'administration, pas une sortie ; et l'onglet Sorties serait
 *   passé à cinq sections, au-delà du seuil que ce module se donne. Réglages
 *   n'en portait qu'une.
 * - `itinerairesPerso` va sous **Sorties** : importer ses propres tracés
 *   cibles est un geste d'entrée de données, voisin de l'import de traces,
 *   même si l'objet produit est une cible et non une sortie. C'est le
 *   placement dont je suis le moins sûr, et il est posé comme question dans
 *   la fiche de session.
 */
const RANGEMENT: Record<Onglet, SectionApp[]> = {
  carte: ['zone'],
  sorties: ['enregistrement', 'traces', 'itinerairesPerso', 'historique'],
  progression: [
    'tableauDeBord',
    'objectifs',
    'prochaineSortie',
    'listeItineraires',
  ],
  reglages: ['reglages', 'sauvegarde'],
}

export function sectionsDeLOnglet(onglet: Onglet): SectionApp[] {
  return RANGEMENT[onglet]
}

export { MAX_SECTIONS_PAR_ONGLET }

/**
 * Identifiants d'ancrage des sections, pour amener à l'une d'elles.
 *
 * La barre d'onglets est visible à toutes les largeurs depuis le 23/08. Sur
 * téléphone elle **filtre** les sections ; sur grand écran, le panneau
 * colonne continue de tout montrer et cliquer un onglet **amène à sa
 * première section**.
 *
 * Filtrer sur grand écran était l'autre lecture, et elle a été essayée : une
 * soixantaine de tests de bout en bout perdaient l'accès aux panneaux — ce
 * qui dit surtout qu'on y cacherait les trois quarts d'un écran qui a la
 * place de tout montrer.
 *
 * Un identifiant, pas un sélecteur : le composant décide comment l'atteindre.
 * Le cœur n'a pas à connaître le DOM.
 */
const ANCRES: Record<SectionApp, string> = {
  zone: 'zone',
  enregistrement: 'enregistrement',
  traces: 'traces',
  itinerairesPerso: 'itineraires-perso',
  tableauDeBord: 'tableau-de-bord',
  objectifs: 'objectifs',
  prochaineSortie: 'prochaine-sortie',
  listeItineraires: 'liste-itineraires',
  historique: 'historique',
  reglages: 'reglages',
  sauvegarde: 'sauvegarde',
}

/** Le repère à atteindre quand on choisit cet onglet. */
export function ancreDeLOnglet(onglet: Onglet): string {
  const premiere = sectionsDeLOnglet(onglet)[0]
  return premiere ? ANCRES[premiere] : ''
}

/** L'identifiant d'ancrage d'une section, pour le poser sur son conteneur. */
export function ancreDeSection(section: SectionApp): string {
  return ANCRES[section]
}

export type Disposition = 'onglets' | 'accordeons'

/**
 * Quelle disposition afficher.
 *
 * Les onglets sont maintenant la disposition par défaut. Ils ont d'abord
 * vécu derrière `?maquette=onglets`, parce que #177 interdisait de les
 * industrialiser avant la session E2 ; c'est Cédric qui a décidé de les
 * passer devant sans attendre la session.
 *
 * L'ancienne disposition reste atteignable par `?maquette=accordeons`, et
 * ce n'est pas une politesse : c'est ce qui permet de conduire E2 malgré
 * tout, en donnant à un groupe l'URL des accordéons et à l'autre l'URL nue.
 * Une bascule qu'on retire ferme la porte à la comparaison en même temps
 * qu'elle simplifie le code.
 *
 * La comparaison est stricte : une valeur voisine rend les onglets, jamais
 * un troisième comportement.
 */
export function dispositionDemandee(recherche: string): Disposition {
  try {
    return new URLSearchParams(recherche).get('maquette') === 'accordeons'
      ? 'accordeons'
      : 'onglets'
  } catch {
    return 'onglets'
  }
}

/**
 * Les trois positions de la feuille glissante sur téléphone.
 *
 * Le type vivait dans `App.tsx`. Il remonte ici parce qu'une règle a besoin
 * de le connaître : celle qui décide où poser la feuille quand on change
 * d'onglet, et qui ne peut pas s'éprouver dans un gestionnaire d'événement.
 */
export type PositionFeuille = 'repliee' | 'moitie' | 'pleine'

/**
 * Les onglets dont tout le contenu vit dans la feuille.
 *
 * « Carte » n'en est pas : son contenu, c'est la carte, qui est *derrière*
 * la feuille et non dedans. Nommé plutôt que testé à l'envers dans deux
 * endroits — c'est la même distinction qui décide de la position et de ce
 * qu'on peut affirmer sur elle (CLAUDE.md §4).
 */
function toutTientDansLaFeuille(onglet: Onglet): boolean {
  return onglet !== 'carte'
}

/**
 * Où poser la feuille en arrivant sur un onglet (AUDIT_UX.md, constat U3).
 *
 * Mesuré avant correction : feuille repliée à 52 px, on touche
 * « Progression », la feuille reste à 52 px. L'onglet s'allumait, l'écran ne
 * bougeait pas, et il fallait deviner qu'un second geste restait à faire.
 *
 * Deux règles, et rien de plus :
 *
 * - un onglet qui n'a rien à montrer hors de la feuille l'ouvre à mi-hauteur
 *   si elle est fermée ;
 * - changer d'onglet ne rétrécit jamais. Quelqu'un qui a déplié en grand
 *   pour lire une longue liste ne doit pas la voir se refermer parce qu'il
 *   est allé voir ailleurs et revenu.
 *
 * Écarté : replier la feuille en arrivant sur « Carte », qui aurait servi le
 * geste « montre-moi la carte ». La poignée est juste là et le fait en un
 * toucher, alors que perdre sa place dans la liste des zones parce qu'on a
 * fait un aller-retour ne se rattrape pas.
 */
export function positionPourOnglet(
  onglet: Onglet,
  courante: PositionFeuille,
): PositionFeuille {
  if (!toutTientDansLaFeuille(onglet)) return courante
  return courante === 'repliee' ? 'moitie' : courante
}

/**
 * Où poser la feuille tant que personne ne l'a touchée (AUDIT_UX.md, U1).
 *
 * Deux raisons de la laisser basse, et une seule de l'ouvrir :
 *
 * - le guide de premier lancement est affiché : il lui faut la hauteur.
 *   Mesuré avant correction sur 390 × 844, son bouton « Voir un exemple »
 *   tombait 46 px sous le bord de la feuille, recouvert et non cliquable —
 *   alors que c'est le seul chemin qui montre le produit à quelqu'un qui
 *   n'a encore aucune trace ;
 * - une zone a été restaurée du cache : on revient regarder sa carte.
 *
 * Sinon la feuille s'ouvre à mi-hauteur : il n'y a rien à voir sur la carte
 * et tout à faire dans le panneau.
 *
 * Rien à désactiver quand le guide se ferme : `guideAffiche` redevient faux,
 * la position se recalcule, la feuille remonte. Un effet qui l'aurait
 * repositionnée aurait fait la même chose en moins fiable.
 */
export function positionInitiale({
  guideAffiche,
  zoneRestauree,
}: {
  guideAffiche: boolean
  zoneRestauree: boolean
}): PositionFeuille {
  return guideAffiche || zoneRestauree ? 'repliee' : 'moitie'
}
