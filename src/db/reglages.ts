/**
 * Les réglages, écrits **avant** que la main soit rendue (issue #203).
 *
 * ## Le défaut
 *
 * Les sept réglages vivaient dans un magasin IndexedDB. Aucune écriture n'y
 * est synchrone : entre le clic et la fin de la transaction, l'interface
 * affirmait quelque chose que la base ne savait pas encore. Un rechargement,
 * une fermeture d'onglet ou un passage en arrière-plan dans cette fenêtre
 * annulait la transaction, et le réglage revenait à sa valeur précédente
 * **alors que la personne l'avait vu changer**.
 *
 * Mesuré : `seuil.spec.ts` échouait une fois sur deux en suite complète,
 * jamais seul. La fenêtre s'élargit avec la charge de la base — sur une base
 * inactive elle se compte en microsecondes, avec une zone chargée et une
 * trace importée elle devient observable.
 *
 * ## Les voies écartées
 *
 * **Montrer après avoir écrit.** Essayée, mesurée, abandonnée : une case à
 * cocher contrôlée par React revient visiblement à son ancien état le temps
 * de l'écriture, puis bascule. Vingt-trois tests de bout en bout l'ont dit
 * d'une seule voix — « Clicking the checkbox did not change its state ».
 * Échanger une perte rare contre un sursaut à chaque clic n'est pas un
 * progrès.
 *
 * **Doubler l'écriture** dans les deux magasins. Deux sources de vérité pour
 * un même réglage, donc un risque de divergence : le genre de chose qui se
 * paie plus tard.
 *
 * ## Ce qui est fait
 *
 * `localStorage` est **synchrone par contrat** : quand `setItem` rend la
 * main, la valeur est écrite. Il n'y a plus de fenêtre à fermer — il n'y a
 * plus de fenêtre. Et les réglages sont exactement ce pour quoi il est
 * fait : sept scalaires, quelques dizaines d'octets.
 *
 * Une seule source à la fois, et laquelle est décidé au démarrage :
 * `localStorage` s'il répond, IndexedDB sinon. Certains navigateurs
 * verrouillés refusent l'un et pas l'autre, et un repli en mémoire ferait
 * perdre les réglages au rechargement — ce qui est le défaut qu'on corrige.
 *
 * Rien ne quitte l'appareil, ni avant ni après : c'est le même stockage
 * local, dans une autre boîte.
 */

import type { SettingKey } from './database.ts'

/**
 * Préfixe des clefs. Sans lui, `objectifs` ou `grosTexte` prendraient un nom
 * commun dans un espace partagé avec tout ce que l'origine stocke.
 */
const PREFIXE = 'sentiers.reglage.'

/**
 * Le magasin, ou `null` s'il refuse.
 *
 * Lu à chaque appel plutôt que capturé une fois : les tests remplacent
 * `globalThis.localStorage`, et une capture au chargement du module figerait
 * le premier vu. Le coût est un accès de propriété.
 *
 * L'accès lui-même peut **lever** — Safari en navigation privée, un
 * navigateur configuré pour refuser le stockage. C'est pourquoi la lecture
 * est enveloppée : un `typeof` ne suffit pas.
 */
function magasin(): Storage | null {
  try {
    const local = (globalThis as { localStorage?: Storage }).localStorage
    if (!local) return null
    // Une écriture d'essai : la présence de l'objet ne dit pas qu'il accepte.
    // Mesuré nécessaire — Safari en navigation privée expose l'API et lève
    // à la première écriture.
    const sonde = `${PREFIXE}__essai`
    local.setItem(sonde, '1')
    local.removeItem(sonde)
    return local
  } catch {
    return null
  }
}

/** Vrai si les réglages peuvent vivre dans `localStorage`. */
export function reglagesSynchronesDisponibles(): boolean {
  return magasin() !== null
}

/**
 * Lit un réglage. Rend `undefined` si le magasin n'en a pas — jamais une
 * valeur inventée : c'est l'appelant qui connaît son défaut.
 */
export function lireReglage(clef: SettingKey): number | string | undefined {
  const local = magasin()
  if (!local) return undefined
  const brut = local.getItem(PREFIXE + clef)
  if (brut === null) return undefined
  /*
    Le type compte. `completionPct` vaut 95 et non « 95 » : `lireDrapeau`
    n'accepte que le nombre 1, et `normalizeCompletionPct` rend sa valeur par
    défaut sur autre chose qu'un nombre. Une chaîne aurait donc silencieusement
    remis les réglages à zéro au premier rechargement.

    JSON plutôt qu'un `Number()` conditionnel : il distingue 95 de « 95 » sans
    heuristique, et la chaîne « 0 » d'un objectif reste une chaîne.
  */
  try {
    const valeur: unknown = JSON.parse(brut)
    if (typeof valeur === 'number' || typeof valeur === 'string') return valeur
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Écrit un réglage, et rend la main **une fois écrit**.
 *
 * Rend `false` si le magasin a refusé — quota atteint, stockage désactivé.
 * L'appelant décide alors, plutôt que de croire l'écriture faite.
 */
export function ecrireReglage(
  clef: SettingKey,
  valeur: number | string,
): boolean {
  const local = magasin()
  if (!local) return false
  try {
    local.setItem(PREFIXE + clef, JSON.stringify(valeur))
    return true
  } catch {
    return false
  }
}

/** Efface un réglage. Sert au nettoyage d'une sauvegarde réimportée. */
export function effacerReglage(clef: SettingKey): void {
  magasin()?.removeItem(PREFIXE + clef)
}
