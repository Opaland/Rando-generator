/**
 * Savoir si une requête sortante emporte un point de vos traces (#178).
 *
 * ## Pourquoi ce module existe
 *
 * « Aucun compte, aucun serveur, rien n'est envoyé » est le seul vrai
 * différenciateur de Sentiers. Il était écrit dans l'en-tête, dans l'accueil,
 * dans « À propos » et sur la page publique — et, depuis #168, le panneau
 * « Ce qui est sorti d'ici » affichait même un compteur :
 *
 *     0 requête contenait vos traces
 *
 * **Ce zéro était écrit en dur.** Un `<strong>0</strong>` dans le JSX. Il ne
 * pouvait pas monter, donc il ne prouvait rien — et il était plus difficile à
 * remettre en cause qu'une phrase, parce qu'il avait l'air d'être compté.
 * C'est le §1 appliqué à l'interface : un indicateur qui ne peut pas échouer
 * n'est pas un indicateur.
 *
 * ## Ce que ce module garde, et ce qu'il ne garde pas
 *
 * Il **garde** : un point de vos traces, écrit à pleine précision, dans le
 * corps d'une requête que l'application envoie.
 *
 * Il ne garde pas :
 *
 * - ce que le navigateur envoie lui-même — images, polices, feuilles de
 *   style — qui ne passe ni par `fetch` ni par XHR ;
 * - un corps binaire ou compressé, qu'on ne lit pas ;
 * - une trace transformée avant d'être envoyée — arrondie, projetée,
 *   chiffrée. Un détecteur qui prétendrait attraper ça mentirait.
 *
 * L'interface doit donc dire ce qui est mesuré, et pas davantage.
 */

import type { LonLat } from './types.ts'

/**
 * Décimales exigées pour reconnaître un point.
 *
 * **Seuil de reconnaissance, tranché au jugement, et il ne change pas ce qui
 * est calculé** — il décide de ce qu'on appelle « un point de votre trace ».
 *
 * Cinq décimales valent environ un mètre de longitude sous nos latitudes.
 * En dessous, on attraperait le centre de la carte, qui part à chaque
 * déplacement : « 45,41 » désigne un carré d'un kilomètre de côté, et
 * n'importe quelle randonnée du Pilat s'y trouve. Un compteur qui crierait
 * au loup à chaque glissement de carte ne serait plus lu.
 *
 * Écarté : comparer des nombres plutôt que des chaînes, avec une tolérance
 * en mètres. Plus juste en théorie, mais il faudrait extraire tous les
 * nombres de chaque corps — un travail proportionnel au corps, sur le fil
 * principal, à chaque requête.
 */
export const PRECISION_MINIMALE = 5

/** Un point de l'échantillon : ses deux coordonnées, à pleine précision. */
export interface PointSurveille {
  lon: string
  lat: string
}

/**
 * Les écritures d'une coordonnée qu'on saura reconnaître.
 *
 * **Tronquer, pas arrondir** — et la première version faisait l'inverse.
 * `(4.512345).toFixed(5)` rend `4.51235`, qui ne se trouve **pas** dans
 * « 4.512345 » : le dernier chiffre a changé. Un point posté à pleine
 * précision, c'est-à-dire le cas courant, passait donc à travers le
 * détecteur. Les deux tests qui postent un point tel quel étaient rouges.
 *
 * Tronqué, `4.51234` est un vrai **préfixe** de toutes les écritures plus
 * précises. On garde quand même la forme arrondie : une application qui
 * enverrait le point déjà réduit à cinq décimales l'écrirait ainsi.
 */
function formesDe(valeur: number): string[] {
  const arrondie = valeur.toFixed(PRECISION_MINIMALE)
  const facteur = 10 ** PRECISION_MINIMALE
  const tronquee = (Math.trunc(valeur * facteur) / facteur).toFixed(
    PRECISION_MINIMALE,
  )
  return arrondie === tronquee ? [tronquee] : [tronquee, arrondie]
}

/**
 * Quelques points d'une trace, répartis d'un bout à l'autre.
 *
 * Un échantillon plutôt que tous les points : une sortie en porte des
 * milliers, et la recherche se fait à chaque requête. Réparti plutôt que
 * pris en tête : une fuite qui n'emporterait que la fin d'une sortie doit
 * être vue elle aussi. Le premier et le dernier y sont toujours — ce sont
 * ceux qui disent d'où l'on part et où l'on arrive.
 */
export function echantillonDeTrace(
  coords: readonly LonLat[],
  combien: number,
): string[] {
  if (coords.length === 0 || combien <= 0) return []
  const pris: LonLat[] = []
  if (coords.length <= combien) pris.push(...coords)
  else {
    const pas = (coords.length - 1) / (combien - 1)
    for (let i = 0; i < combien; i += 1) {
      pris.push(coords[Math.round(i * pas)] as LonLat)
    }
  }
  /*
    Un point donne jusqu'à quatre chaînes — deux écritures par coordonnée,
    croisées. C'est peu, et la comparaison reste une recherche de
    sous-chaîne, donc à la portée du fil principal.
  */
  return pris.flatMap((point) =>
    formesDe(point[0]).flatMap((lon) =>
      formesDe(point[1]).map((lat) => `${lon} ${lat}`),
    ),
  )
}

/**
 * Ce corps de requête emporte-t-il un point de l'échantillon ?
 *
 * Les **deux** coordonnées du même point sont exigées. Une longitude seule
 * peut appartenir à n'importe quoi — une borne de zone, un centre de carte,
 * un identifiant. Le couple, non : le trouver dans un corps veut dire que ce
 * point-là est parti.
 *
 * L'ordre ne compte pas, et le séparateur non plus : `[4.5,45.4]`,
 * `lat=45.4&lon=4.5` et `45.4|4.5` disent la même chose.
 */
export function corpsContientUnPoint(
  corps: string | null | undefined,
  echantillon: readonly string[],
): boolean {
  if (!corps || echantillon.length === 0) return false
  for (const point of echantillon) {
    const [lon, lat] = point.split(' ')
    if (!lon || !lat) continue
    if (corps.includes(lon) && corps.includes(lat)) return true
  }
  return false
}
