import { distanceMeters } from './geo.ts'
import { elevationGainMeters } from './gpx.ts'
import {
  dureeEnMarche,
  dureeTotale,
  type Enregistrement,
  type Intervalle,
  type PointBrut,
} from './recorder.ts'
import type { LonLat, Track } from './types.ts'

/**
 * Ce que l'écran de marche a le droit d'afficher (issue #152, pierre 3).
 *
 * Les chiffres d'abord, l'écran ensuite : **un kilométrage faux est pire
 * qu'un kilométrage absent**, parce qu'on le croit. Tout ce qui est ici se
 * calcule sans navigateur, et se vérifie sans navigateur.
 *
 * Deux choses n'y sont pas, et c'est délibéré :
 *
 * - **« ce qu'il reste »** suppose de savoir quel itinéraire on suit. Rien
 *   dans l'enregistrement ne le dit aujourd'hui ; le déduire de la position
 *   demanderait un appariement en direct, dont le seuil de tolérance change
 *   ce qui est compté (issues #150 et #151) ;
 * - **aucun filtre de bruit sur les positions.** Distance minimale entre
 *   deux points, intervalle minimal, seuil de précision : ces trois-là
 *   changent ce qui est enregistré, donc ce qui sera compté comme parcouru.
 *   Les fixer demande de mesurer sur des sorties réelles (CLAUDE.md §2).
 *   En attendant, tous les points comptent, et la distance affichée est
 *   celle du GPS brut — un peu plus longue que la réalité.
 */

/** À quel intervalle de marche appartient un instant, ou -1 s'il tombe dehors. */
function intervalleDe(instant: number, intervalles: Intervalle[]): number {
  return intervalles.findIndex(
    (intervalle) =>
      instant >= intervalle.debut &&
      (intervalle.fin === null || instant <= intervalle.fin),
  )
}

/**
 * La distance effectivement marchée, en mètres.
 *
 * **Le segment qui enjambe une pause n'est pas compté.** Une pause de deux
 * heures pendant laquelle on redescend en voiture chercher des lacets
 * laisserait, entre le dernier point d'avant et le premier point d'après,
 * un segment de quinze kilomètres que personne n'a marché. L'enregistrement
 * ne sait pas ce qui s'est passé : il n'écoutait pas. On ne compte que ce
 * qu'on a vu — c'est le même raisonnement qu'à la reprise après un onglet
 * tué.
 */
export function distanceParcourue(e: Enregistrement): number {
  let total = 0
  let avant: PointBrut | null = null
  for (const apres of e.points) {
    if (
      avant !== null &&
      intervalleDe(avant.instant, e.intervalles) ===
        intervalleDe(apres.instant, e.intervalles)
    ) {
      total += distanceMeters([avant.lon, avant.lat], [apres.lon, apres.lat])
    }
    avant = apres
  }
  return total
}

/**
 * Le dénivelé positif cumulé, ou `null` si aucun point ne porte d'altitude.
 *
 * L'hystérésis de 3 m est celle qu'applique déjà `elevationGainMeters` à
 * toute trace importée : on ne s'en invente pas une autre. Deux formules
 * pour le même chiffre finiraient par diverger, et personne ne saurait
 * laquelle est affichée (CLAUDE.md §4).
 */
export function deniveleParcouru(e: Enregistrement): number | null {
  return elevationGainMeters(e.points.map((point) => point.altitude))
}

export interface ChiffresSortie {
  distanceMetres: number
  dureeTotaleMs: number
  dureeEnMarcheMs: number
  deniveleMetres: number | null
  /** Moyenne sur le temps de marche, `null` tant qu'il n'y a rien à diviser. */
  vitesseMetresParSeconde: number | null
  points: number
}

export function chiffresDeLaSortie(
  e: Enregistrement,
  maintenant: number,
): ChiffresSortie {
  const distanceMetres = distanceParcourue(e)
  const dureeEnMarcheMs = dureeEnMarche(e, maintenant)
  return {
    distanceMetres,
    dureeTotaleMs: dureeTotale(e, maintenant),
    dureeEnMarcheMs,
    deniveleMetres: deniveleParcouru(e),
    // Un quotient n'invente rien, mais il ne dit rien non plus quand son
    // dénominateur est nul : sur les premières secondes, le moindre saut
    // GPS donnerait des dizaines de kilomètres-heure.
    vitesseMetresParSeconde:
      dureeEnMarcheMs > 0 ? distanceMetres / (dureeEnMarcheMs / 1000) : null,
    points: e.points.length,
  }
}

/**
 * La trace que la sortie laisse derrière elle, ou `null` s'il n'y a rien.
 *
 * C'est le point de jonction avec tout l'aval — appariement, progression,
 * historique, export : à partir d'ici, une sortie enregistrée est une trace
 * comme une autre, et rien n'a besoin de savoir d'où elle vient.
 *
 * La précision de la géolocalisation va dans `precisionsMetres`, pas dans
 * `hdops` : ce ne sont pas les mêmes grandeurs, et la ranger là serait
 * mentir sur ce qu'on mesure.
 */
export function versTrace(e: Enregistrement, id: string): Track | null {
  const { demarreA, termineA } = e
  if (e.etat !== 'termine') return null
  if (e.points.length === 0) return null
  // Les deux instants sont posés par `demarrer` et `terminer` ; la structure
  // les autorise pourtant à manquer, et une trace datée d'une date inventée
  // est pire qu'une trace absente — elle irait se ranger dans l'historique
  // d'une autre année.
  if (demarreA === null || termineA === null) return null

  const points: LonLat[] = e.points.map((point) => [point.lon, point.lat])
  return {
    id,
    // Pas de nom de fichier inventé : cette trace n'en a pas, et le dire
    // vaut mieux qu'un « sortie-2026-08-23.gpx » qui n'existe nulle part.
    filename: 'Sortie enregistrée',
    points,
    date: new Date(demarreA).toISOString(),
    importedAt: new Date(termineA).toISOString(),
    elevationGain: deniveleParcouru(e),
    times: e.points.map((point) => point.instant),
    hdops: null,
    precisionsMetres: e.points.map((point) => point.precisionMetres),
  }
}
