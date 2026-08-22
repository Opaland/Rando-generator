import { estDansLeMonde } from './coordonnees.ts'

/**
 * L'enregistrement d'une sortie, machine à états (issue #152).
 *
 * C'est la pièce qui manque, et elle est en amont de tout le reste : pour
 * voir sa progression aujourd'hui, il faut enregistrer sa sortie dans une
 * autre application, l'exporter, et l'importer ici. La proposition de valeur
 * dépend d'un concurrent — c'est ce que l'audit externe du 20/08 appelle le
 * seul problème existentiel du produit.
 *
 * **Enregistrer n'est pas guider.** Ni instructions, ni voix, ni recalcul
 * d'itinéraire : le brief l'exclut et l'audit le confirme. On se souvient
 * d'où l'on est passé, on ne dit à personne où aller.
 *
 * Ce module ne connaît ni la géolocalisation, ni IndexedDB, ni React. Il
 * reçoit des points et des instants, et rend un nouvel état. Tout ce qui se
 * casse en silence est ici — le temps qui court pendant une pause, un double
 * appui sur « Pause », une sortie démarrée par accident — et tout cela
 * s'éprouve sans navigateur.
 */

export type EtatEnregistrement = 'repos' | 'enregistrement' | 'pause' | 'termine'

export type Action =
  | 'demarrer'
  | 'suspendre'
  | 'reprendre'
  | 'terminer'
  | 'abandonner'

/**
 * Un point tel que la géolocalisation le rendra, avant tout filtrage.
 *
 * `precisionMetres` est le rayon à 68 % de confiance que rend
 * `GeolocationCoordinates.accuracy`. Il est conservé tel quel : c'est lui
 * qui permettra plus tard d'écarter les points imprécis (issue #150), et ce
 * seuil-là ne s'invente pas — il change ce qui est compté.
 */
export interface PointBrut {
  lon: number
  lat: number
  /** Millisecondes depuis l'époque Unix, comme `Track.times` (issue #149). */
  instant: number
  precisionMetres: number | null
  altitude: number | null
}

/**
 * Un intervalle de marche : du démarrage ou d'une reprise, jusqu'à la pause
 * ou la fin suivante. `fin` vaut `null` tant qu'il court.
 *
 * Le temps de marche est la somme de ces intervalles, et non « le temps
 * total moins les pauses ». Les deux formules donnent le même nombre quand
 * tout va bien, et divergent dès qu'un état est manqué — la première ne peut
 * pas devenir négative, la seconde si.
 */
export interface Intervalle {
  debut: number
  fin: number | null
}

export interface Enregistrement {
  etat: EtatEnregistrement
  points: PointBrut[]
  /** Instant du tout premier démarrage. `null` tant qu'on n'a pas commencé. */
  demarreA: number | null
  /** Instant de `terminer`. `null` tant que rien n'est terminé. */
  termineA: number | null
  intervalles: Intervalle[]
}

export function enregistreurVide(): Enregistrement {
  return {
    etat: 'repos',
    points: [],
    demarreA: null,
    termineA: null,
    intervalles: [],
  }
}

/**
 * Ce que la machine accepte dans son état courant.
 *
 * Nommé une fois et lu par l'interface, plutôt que recopié dans chaque
 * bouton : c'est la même condition qui décide si un bouton est actif et si
 * un geste change quelque chose, et deux copies auraient dérivé (CLAUDE.md
 * §4). Un test vérifie que ce que cette fonction annonce est exactement ce
 * qui agit — ni action annoncée sans effet, ni action tue qui agit quand
 * même.
 */
export function actionsPossibles(e: Enregistrement): Action[] {
  switch (e.etat) {
    case 'repos':
      return ['demarrer']
    case 'enregistrement':
      return ['suspendre', 'terminer', 'abandonner']
    case 'pause':
      return ['reprendre', 'terminer', 'abandonner']
    case 'termine':
      return []
  }
}

function accepte(e: Enregistrement, action: Action): boolean {
  return actionsPossibles(e).includes(action)
}

/** Ferme l'intervalle de marche en cours, s'il y en a un. */
function fermerIntervalle(intervalles: Intervalle[], instant: number): Intervalle[] {
  return intervalles.map((intervalle, i) =>
    i === intervalles.length - 1 && intervalle.fin === null
      ? { ...intervalle, fin: instant }
      : intervalle,
  )
}

export function demarrer(e: Enregistrement, instant: number): Enregistrement {
  if (!accepte(e, 'demarrer')) return e
  return {
    ...e,
    etat: 'enregistrement',
    demarreA: instant,
    intervalles: [{ debut: instant, fin: null }],
  }
}

export function suspendre(e: Enregistrement, instant: number): Enregistrement {
  if (!accepte(e, 'suspendre')) return e
  return {
    ...e,
    etat: 'pause',
    intervalles: fermerIntervalle(e.intervalles, instant),
  }
}

export function reprendre(e: Enregistrement, instant: number): Enregistrement {
  if (!accepte(e, 'reprendre')) return e
  return {
    ...e,
    etat: 'enregistrement',
    intervalles: [...e.intervalles, { debut: instant, fin: null }],
  }
}

export function terminer(e: Enregistrement, instant: number): Enregistrement {
  if (!accepte(e, 'terminer')) return e
  return {
    ...e,
    etat: 'termine',
    termineA: instant,
    intervalles: fermerIntervalle(e.intervalles, instant),
  }
}

/**
 * Jeter la sortie en cours, sans rien produire.
 *
 * L'issue ne le nomme pas ; on ne peut pas s'en passer. Démarrer par
 * accident arrive — une poche, un appui de trop — et personne ne veut d'une
 * sortie fantôme de trois mètres dans son historique. `terminer` produit une
 * trace, `abandonner` n'en produit aucune.
 */
export function abandonner(e: Enregistrement): Enregistrement {
  if (!accepte(e, 'abandonner')) return e
  return enregistreurVide()
}

/**
 * Retient un point, s'il arrive pendant l'enregistrement et s'il tombe sur
 * Terre.
 *
 * Deux refus, et pas un de plus dans cette pierre-ci :
 *
 * - **en pause, rien ne compte.** Le téléphone continue d'émettre pendant
 *   qu'on boit un café ; c'est tout l'objet d'une pause que ce café ne
 *   fasse pas avancer sur le sentier ;
 * - **un point hors du monde est refusé**, comme à l'import (issue #183).
 *   Un émulateur, une extension, un capteur qui redémarre : la
 *   géolocalisation d'un navigateur peut rendre n'importe quoi.
 *
 * Ce qui **n'est pas** filtré ici, et qui viendra avec sa mesure : la
 * distance minimale entre deux points retenus, l'intervalle minimal, et le
 * seuil de précision au-delà duquel un point est du bruit. Ces trois-là
 * changent **ce qui est enregistré**, donc ce qui sera compté comme
 * parcouru — ils ne s'inventent pas (CLAUDE.md §2). Les fixer demande de
 * mesurer sur des sorties réelles, pas de choisir un nombre rond.
 */
export function ajouterPoint(
  e: Enregistrement,
  point: PointBrut,
): Enregistrement {
  if (e.etat !== 'enregistrement') return e
  if (!estDansLeMonde(point.lon, point.lat)) return e
  return { ...e, points: [...e.points, point] }
}

/**
 * Le temps écoulé depuis le démarrage, pauses comprises.
 *
 * `maintenant` sert tant que rien n'est terminé : c'est ce que l'écran de
 * marche affiche et qui doit avancer entre deux points. Une fois la sortie
 * finie, il est ignoré — le chiffre est arrêté.
 */
export function dureeTotale(e: Enregistrement, maintenant?: number): number {
  if (e.demarreA === null) return 0
  const fin = e.termineA ?? maintenant ?? e.demarreA
  return Math.max(0, fin - e.demarreA)
}

/**
 * Le temps passé à marcher, pauses déduites.
 *
 * Somme des intervalles, et non « total moins pauses » : les deux donnent le
 * même nombre quand tout va bien, et la seconde peut devenir négative si un
 * état est manqué. Un test garde l'invariant — marche ≤ total, et aucun des
 * deux ne recule.
 */
export function dureeEnMarche(e: Enregistrement, maintenant?: number): number {
  return e.intervalles.reduce((somme, intervalle) => {
    const fin = intervalle.fin ?? maintenant ?? intervalle.debut
    return somme + Math.max(0, fin - intervalle.debut)
  }, 0)
}
