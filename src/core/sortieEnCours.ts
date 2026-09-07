import { distanceMeters } from './geo.ts'
import { elevationGainMeters } from './gpx.ts'
import {
  dureeEnMarche,
  dureeTotale,
  type Enregistrement,
  type Intervalle,
  type PointBrut,
} from './recorder.ts'
import type { ElevationProfile, LonLat, Track } from './types.ts'

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
    if (avant !== null && segmentCompte(avant, apres, e.intervalles)) {
      total += distanceMeters([avant.lon, avant.lat], [apres.lon, apres.lat])
    }
    avant = apres
  }
  return total
}

/**
 * Un pas entre deux relevés consécutifs a-t-il été vraiment marché ?
 *
 * Nommée pour que `distanceParcourue` et `profilDeSortie` la consultent
 * toutes les deux plutôt que de la recopier — le même segment qui enjambe
 * une pause ne doit pas allonger la distance affichée d'un côté et l'axe du
 * profil de l'autre (CLAUDE.md §4).
 */
function segmentCompte(
  avant: PointBrut,
  apres: PointBrut,
  intervalles: Intervalle[],
): boolean {
  return (
    intervalleDe(avant.instant, intervalles) ===
    intervalleDe(apres.instant, intervalles)
  )
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


/**
 * Y a-t-il une sortie ouverte — en marche ou en pause ?
 *
 * Nommée une fois plutôt que recopiée : trois endroits la consultent
 * maintenant — le tracé provisoire sur la carte, le témoin de la barre
 * d'onglets, et le libellé qui dit lequel des deux états. Trois copies
 * auraient dérivé, et la dérive se serait vue comme une sortie qui
 * s'enregistre sans que rien ne le dise (CLAUDE.md §4).
 */
export function sortieOuverte(e: Enregistrement): boolean {
  return e.etat === 'enregistrement' || e.etat === 'pause'
}

/**
 * Ce que le témoin de la barre d'onglets doit dire, ou `null` s'il n'a rien
 * à dire.
 *
 * Une sortie **en pause** mérite son témoin autant qu'une sortie en
 * marche : c'est même celle qu'on oublie. La pause est justement le moment
 * où l'on range son téléphone en croyant avoir fini.
 */
export function temoinDeSortie(
  e: Enregistrement,
): 'enregistrement' | 'pause' | null {
  return sortieOuverte(e) ? (e.etat as 'enregistrement' | 'pause') : null
}

/**
 * Identifiant de la sortie en cours sur la carte.
 *
 * Constant, et distinct de ceux des traces rangées : il n'y a qu'une sortie
 * à la fois, et la couche la remplace au lieu d'en empiler des copies.
 */
export const ID_TRACE_PROVISOIRE = 'sortie-en-cours'

/**
 * La sortie qu'on est en train de marcher, vue comme une trace.
 *
 * Sans elle, on marche deux heures en regardant une carte vide : le produit
 * s'appelle Sentiers et ne montrait le sentier qu'une fois la sortie
 * rangée. Elle passe par la même source que les traces importées — une
 * seule couche, un seul style, rien à tenir en double (CLAUDE.md §4).
 *
 * Elle continue de se dessiner **pendant une pause** : ce qui est déjà
 * marché l'a bien été. Elle disparaît en revanche dès que la sortie est
 * terminée, parce qu'à cet instant `versTrace` en produit une vraie, et
 * qu'un tracé affiché deux fois est un tracé faux.
 *
 * Pas de date : ce n'est pas encore une sortie, et lui en donner une la
 * ferait apparaître dans l'historique d'une journée qui n'est pas finie.
 */
export function traceProvisoire(e: Enregistrement): Track | null {
  const { demarreA } = e
  if (!sortieOuverte(e)) return null
  if (e.points.length < 2) return null
  // Même règle qu'à la fin : pas d'instant, pas de trace. Un repli sur zéro
  // daterait la sortie de 1970, et une date inventée finit toujours par se
  // retrouver quelque part.
  if (demarreA === null) return null
  return {
    id: ID_TRACE_PROVISOIRE,
    filename: 'Sortie en cours',
    points: e.points.map((point) => [point.lon, point.lat]),
    date: null,
    importedAt: new Date(demarreA).toISOString(),
    elevationGain: deniveleParcouru(e),
    times: e.points.map((point) => point.instant),
    hdops: null,
    precisionsMetres: e.points.map((point) => point.precisionMetres),
  }
}

/** Ce qu'il y a à dire sur un chiffre vide, ou `null` s'il n'y a rien à dire. */
export interface ExplicationsSortie {
  distance: string | null
  denivele: string | null
}

/**
 * Pourquoi la distance ou le dénivelé restent vides (issue #500).
 *
 * Retour de Cédric, 04/09 : « j'ai bien la durée qui s'affiche ; par contre
 * la distance et le dénivelé ne sont pas affichés ». Ils l'étaient — à
 * `0 m` et `—`. La durée, elle, avance parce qu'elle vient de l'horloge et
 * non des positions. **Un chiffre vide qu'on n'explique pas se lit comme
 * une panne**, et les deux causes possibles ne se distinguaient d'aucune
 * façon à l'écran : aucune altitude reçue, ou aucun déplacement mesuré.
 *
 * Ce qui est dit ici n'invente aucun seuil. Ce sont des faits sur ce qu'on
 * a reçu — « l'appareil n'a envoyé aucune altitude », « les positions
 * reçues ne s'écartent pas » — et non un jugement sur ce qui serait assez.
 * Décider qu'une position est trop imprécise pour compter changerait ce qui
 * est compté comme parcouru, et demande une mesure sur des sorties réelles
 * (CLAUDE.md §2) ; c'est le sujet du filtre de bruit, pas celui-ci.
 *
 * Avant la première position, on se tait : `sortie-attente` tient déjà ce
 * cas, et deux messages pour le même moment se contrediraient un jour.
 */
export function expliqueLesChiffres(
  chiffres: ChiffresSortie,
): ExplicationsSortie {
  if (chiffres.points === 0) return { distance: null, denivele: null }
  return {
    distance:
      chiffres.distanceMetres > 0
        ? null
        : 'Aucun déplacement mesuré pour l’instant — les positions reçues ne s’écartent pas.',
    // Un dénivelé nul n'est pas un dénivelé absent : le terrain était plat,
    // et c'est une mesure. Seul `null` dit que rien ne portait d'altitude.
    denivele:
      chiffres.deniveleMetres === null
        ? 'Votre appareil ne fournit pas d’altitude — le dénivelé ne peut pas être calculé.'
        : null,
  }
}

/**
 * Le profil altimétrique de la sortie en cours, ou `null` avant la
 * deuxième position (issue #502) — même seuil que `traceProvisoire`,
 * puisqu'un profil à un seul point n'en est pas un.
 *
 * Le choix du GPS brut plutôt que d'un rééchantillonnage sur le MNT IGN
 * n'est pas neutre, et il est assumé : une requête réseau par sortie irait
 * contre le « 100 % local », et le MNT ne couvre pas le monde (#355) — une
 * sortie hors de France n'aurait alors aucun profil. Le GPS, lui, reste
 * cohérent avec le dénivelé déjà affiché (`deniveleParcouru`), qui vient
 * de la même donnée.
 *
 * L'axe des distances suit `segmentCompte` : le même pas qui n'allonge pas
 * `distanceParcourue` sur une pause n'allonge pas non plus le profil — les
 * deux se lisent l'un à côté de l'autre, ils ne peuvent pas diverger.
 *
 * Les altitudes manquantes restent `null`, jamais comblées : `ElevationChart`
 * sait déjà les traverser (`fillElevationGaps`), et une valeur inventée ici
 * mentirait sur ce que l'appareil a vraiment mesuré.
 */
export function profilDeSortie(e: Enregistrement): ElevationProfile | null {
  if (e.points.length < 2) return null
  const distances: number[] = []
  const elevations: (number | null)[] = []
  const coords: LonLat[] = []
  let total = 0
  let avant: PointBrut | null = null
  for (const apres of e.points) {
    if (avant !== null && segmentCompte(avant, apres, e.intervalles)) {
      total += distanceMeters([avant.lon, avant.lat], [apres.lon, apres.lat])
    }
    distances.push(total)
    elevations.push(apres.altitude)
    coords.push([apres.lon, apres.lat])
    avant = apres
  }
  return { distances, elevations, coords }
}
