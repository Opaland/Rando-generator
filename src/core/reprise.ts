import type { Enregistrement, Intervalle, PointBrut } from './recorder.ts'

/**
 * Survivre à un onglet tué (issue #152, pierre 2).
 *
 * Une sortie dure quatre heures. Pendant ces quatre heures, l'écran se
 * verrouille, le navigateur récupère de la mémoire, la batterie se vide,
 * quelqu'un balaie l'application par mégarde. **Ce qui n'a pas été écrit
 * n'existe pas** — et une sortie perdue est pire que pas de sortie du tout,
 * parce qu'on l'a marchée.
 *
 * Ce module ne connaît ni IndexedDB ni React. Il dit deux choses :
 *
 * - **ce qu'il reste à écrire**, pour n'écrire chaque point qu'une fois ;
 * - **ce qu'on retrouve**, quand l'application rouvre sur une sortie qui
 *   n'a jamais été terminée.
 *
 * ## Pourquoi il n'y a pas de seuil de sauvegarde ici
 *
 * La question « toutes les combien de secondes écrit-on ? » ne se pose pas,
 * parce qu'on n'écrit jamais l'enregistrement entier : les points
 * s'ajoutent un par un, et l'en-tête — court, et sans les points — est
 * réécrit aux transitions, qui sont rares. Chaque écriture coûte le même
 * prix du début à la fin, là où réécrire le tableau complet aurait coûté de
 * plus en plus cher à mesure que la sortie s'allonge.
 *
 * C'est aussi ce qui évite d'inventer un nombre (CLAUDE.md §2) : un seuil de
 * sauvegarde décide de ce qui est perdu quand l'onglet meurt, donc de ce qui
 * sera compté comme parcouru. Ici, la fenêtre de perte est d'un point.
 */

/**
 * Version du format écrit sur le disque.
 *
 * À incrémenter dès que le sens d'un champ change. Un en-tête d'une autre
 * version n'est pas relu : ses intervalles pourraient ne plus vouloir dire
 * la même chose, et une sortie inventée est pire qu'une sortie absente.
 */
export const VERSION_REPRISE = 1

/**
 * L'état d'une sortie **sans ses points** : ce qui est réécrit à chaque
 * transition, et qui tient en quelques octets quelle que soit la longueur
 * de la randonnée.
 */
export interface EnteteEnregistrement {
  version: number
  etat: Enregistrement['etat']
  demarreA: number | null
  termineA: number | null
  intervalles: Intervalle[]
  /** Instant de cette écriture — le dernier moment où l'application vivait. */
  ecritA: number
}

export function entete(
  e: Enregistrement,
  instant: number,
): EnteteEnregistrement {
  return {
    version: VERSION_REPRISE,
    etat: e.etat,
    demarreA: e.demarreA,
    termineA: e.termineA,
    intervalles: e.intervalles,
    ecritA: instant,
  }
}

/**
 * Les points que le disque n'a pas encore vus.
 *
 * `dejaEcrits` vient du disque, `e.points` de la mémoire : rien ne garantit
 * que le premier soit le plus petit. Un compteur en avance — une base
 * rouverte, une écriture concurrente — ne doit surtout pas faire redemander
 * des points inexistants ; `slice` s'en charge en rendant un tableau vide,
 * et un `Math.min` écrit ici d'abord en garde-fou n'a pas survécu à la
 * mutation : il ne changeait rien. Le cas reste gardé par un test, parce
 * que c'est le comportement qui compte, pas la ligne qui l'obtient.
 */
export function pointsAEcrire(
  e: Enregistrement,
  dejaEcrits: number,
): PointBrut[] {
  return e.points.slice(dejaEcrits)
}

/** Ferme l'intervalle en cours, s'il y en a un. */
function fermerA(intervalles: Intervalle[], instant: number): Intervalle[] {
  return intervalles.map((intervalle, i) =>
    i === intervalles.length - 1 && intervalle.fin === null
      ? { ...intervalle, fin: instant }
      : intervalle,
  )
}

/**
 * Ce qu'on retrouve au démarrage, ou `null` s'il n'y a rien à reprendre.
 *
 * **Une sortie reprise est en pause, jamais en marche.** C'est la décision
 * de cette pierre, et elle n'est pas technique : un onglet tué à 10 h et
 * rouvert à 13 h ne veut pas dire qu'on a marché trois heures. On ne sait
 * pas ce qui s'est passé — la personne a peut-être continué sans son
 * téléphone, peut-être déjeuné, peut-être rangé la sortie. Reprendre en
 * marche attribuerait ces trois heures au sentier ; reprendre en pause
 * arrête le chronomètre là où finit ce qu'on sait, et laisse la personne
 * décider.
 *
 * Le « dernier moment connu » est le plus récent du dernier point et de la
 * dernière écriture d'en-tête : les deux ne sont pas écrits au même rythme,
 * et l'un ou l'autre peut être le plus frais.
 */
export function reprendreApresInterruption(
  tete: EnteteEnregistrement,
  points: PointBrut[],
): Enregistrement | null {
  if (tete.version !== VERSION_REPRISE) return null
  if (tete.demarreA === null) return null
  if (tete.etat !== 'enregistrement' && tete.etat !== 'pause') return null

  const dernierPoint = points.at(-1)?.instant ?? tete.demarreA
  const dernierInstantConnu = Math.max(dernierPoint, tete.ecritA)

  return {
    etat: 'pause',
    points,
    demarreA: tete.demarreA,
    termineA: null,
    intervalles: fermerA(tete.intervalles, dernierInstantConnu),
  }
}
