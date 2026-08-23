/**
 * Deux registres d'affichage, pas deux applications (issue #173).
 *
 * Sur quatorze personas parcourus, deux échouent totalement en autonomie :
 * un enfant de neuf ans et une femme de soixante-seize ans. Ce n'est pas un
 * défaut de code — les cibles font 44 px sous `pointer: coarse`, le plancher
 * typographique tient à 14 px en extérieur, `axe-core` tourne en intégration
 * continue. C'est un défaut de **mode** : l'interface n'a qu'un seul
 * registre, celui de l'utilisateur moyen outillé.
 *
 * Mêmes données, même calcul, même code métier. Le mode simple ne retire
 * rien : il **cache** ce qui n'est pas nécessaire pour répondre à « montre
 * où on a marché ».
 */

export type ModeAffichage = 'complet' | 'simple'

export interface Mode {
  id: ModeAffichage
  libelle: string
  explication: string
}

export const MODES_AFFICHAGE: readonly Mode[] = [
  {
    id: 'complet',
    libelle: 'Complet',
    explication:
      'Toutes les sections : itinéraires, objectifs, historique, réglages et sauvegarde.',
  },
  {
    id: 'simple',
    libelle: 'Simple',
    explication:
      'Une carte, un grand chiffre, et vos sorties. Rien d’autre à l’écran, et rien de perdu — le mode se change quand vous voulez.',
  },
]

/** La valeur relue en base est-elle un mode connu ? */
export function estModeAffichage(valeur: unknown): valeur is ModeAffichage {
  return MODES_AFFICHAGE.some((mode) => mode.id === valeur)
}

/**
 * Relit un réglage booléen, stocké en 0/1 faute de booléen en base.
 *
 * Tout ce qui n'est pas exactement 1 vaut faux : une valeur écrite par une
 * version future, ou abîmée, ne doit pas imposer un affichage que personne
 * n'a demandé.
 *
 * Nommée plutôt que recopiée : trois réglages se relisent maintenant de
 * cette façon — gros texte, guide fermé, panneau replié. Le troisième aurait
 * été le moment de la copier une fois de trop (CLAUDE.md §4).
 */
export function lireDrapeau(valeur: unknown): boolean {
  return valeur === 1
}

/** Ce que l'application a en main quand elle décide d'afficher le guide. */
export interface EtatDonnees {
  itineraires: boolean
  itinerairesPerso: boolean
  traces: boolean
  chargement: boolean
}

/**
 * Le guide de premier lancement a-t-il quelque chose à dire ?
 *
 * Cette condition était écrite en ligne dans le rendu de `App`. Elle est
 * nommée parce qu'un deuxième endroit doit la consulter : le rappel qui
 * permet de **rouvrir** le guide après l'avoir fermé. Deux conditions
 * recopiées auraient dérivé, et la dérive se serait vue comme un guide
 * impossible à retrouver.
 */
export function guideDisponible(donnees: EtatDonnees): boolean {
  return (
    !donnees.itineraires &&
    !donnees.itinerairesPerso &&
    !donnees.traces &&
    !donnees.chargement
  )
}

/** Le guide s'affiche-t-il en pleine surcouche ? */
export function guideDemarrageVisible(
  donnees: EtatDonnees,
  ferme: boolean,
): boolean {
  return guideDisponible(donnees) && !ferme
}

/**
 * Le rappel discret s'affiche-t-il à la place ?
 *
 * Exactement quand le guide serait affiché mais a été fermé : fermer une
 * chose ne doit jamais faire disparaître le moyen de la rouvrir.
 */
export function rappelGuideVisible(
  donnees: EtatDonnees,
  ferme: boolean,
): boolean {
  return guideDisponible(donnees) && ferme
}

/** Ce que chaque mode laisse voir. */
export interface Sections {
  zone: boolean
  /**
   * Enregistrer une sortie ne se replie pas en mode simple (issue #152).
   *
   * Le mode simple cache ce qui encombre, pas ce qui sert : quelqu'un qui a
   * choisi l'affichage sobre est justement quelqu'un pour qui appuyer sur un
   * bouton et marcher doit rester possible sans rien comprendre au reste.
   */
  enregistrement: boolean
  traces: boolean
  tableauDeBord: boolean
  itineraires: boolean
  objectifs: boolean
  prochaineSortie: boolean
  historique: boolean
  reglages: boolean
  sauvegarde: boolean
}

/**
 * Les sections visibles dans un mode donné.
 *
 * La carte, les traces et le tableau de bord ne disparaissent jamais : ce
 * sont eux qui répondent à la question que tout le monde vient poser. Charger
 * une zone et déposer une trace restent possibles en mode simple, sans quoi
 * il n'y aurait rien à montrer.
 */
export function sectionsVisibles(mode: ModeAffichage): Sections {
  const complet = mode === 'complet'
  return {
    zone: true,
    enregistrement: true,
    traces: true,
    tableauDeBord: true,
    itineraires: complet,
    objectifs: complet,
    prochaineSortie: complet,
    historique: complet,
    reglages: complet,
    sauvegarde: complet,
  }
}

/**
 * Seuils des deuxième et troisième étoiles, en pourcentage d'itinéraire
 * couvert par la sortie.
 *
 * **Ces deux nombres sont un jugement, pas une mesure**, et il faut le dire
 * plutôt que de le laisser deviner. J'ai refusé d'inventer les valeurs de
 * tolérance (issue #174) et la même honnêteté s'applique ici — avec une
 * différence qui justifie de trancher quand même : la tolérance décide de
 * **ce qui est compté**, et l'inventer aurait silencieusement changé le
 * pourcentage de chaque utilisateur. Ces seuils-ci ne décident que de la
 * façon dont un résultat déjà calculé est décoré. Rien de calculé ne bouge
 * si on les change.
 *
 * Les ancrer au seuil « bouclé » (90–100 %) a été envisagé et écarté : une
 * seule sortie boucle rarement 95 % d'un GR, la troisième étoile serait
 * inatteignable et ne dirait plus rien.
 */
const ETOILES_SEUILS = { troisieme: 75, deuxieme: 40 } as const

/**
 * Étoiles d'une sortie, d'après la part d'itinéraires balisés qu'elle couvre.
 *
 * Ce n'est **pas un score**. Pas de notification, pas de classement, pas de
 * comparaison entre personnes : Théo doit pouvoir regarder ce qu'il a marché,
 * pas courir après un chiffre. Une étoile dit « ça a compté », trois disent
 * « ça a bien compté », et c'est tout ce que cela dit.
 */
export function etoilesDeSortie(pourcentage: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(pourcentage) || pourcentage <= 0) return 0
  if (pourcentage >= ETOILES_SEUILS.troisieme) return 3
  if (pourcentage >= ETOILES_SEUILS.deuxieme) return 2
  return 1
}
