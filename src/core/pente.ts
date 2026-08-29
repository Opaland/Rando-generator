import type { ElevationProfile } from './types.ts'

/**
 * La pente d'un itinéraire, dite avec sa résolution (issue #179).
 *
 * Farid, mobilité réduite, et Nadia et Yann avec une poussette butent sur la
 * même absence. L'issue pose la règle qui commande tout ce module :
 *
 * > Se tromper ici ne coûte pas une déception : ça envoie quelqu'un en
 * > fauteuil ou avec une poussette sur un sentier impraticable.
 *
 * D'où le choix central : on ne rend **jamais** un pourcentage nu. Le profil
 * altimétrique est échantillonné à cent points au plus (`MAX_ELEVATION_POINTS`)
 * — sur un itinéraire de 20 km, cela fait un point tous les 200 mètres. Une
 * rampe de 30 mètres à 20 % disparaît entièrement dans une telle moyenne.
 *
 * Le chiffre reste utile pour qui pousse une poussette ou roule : une moyenne
 * de 12 % sur 200 m est un mur, quelle que soit la finesse. Mais il doit être
 * présenté comme ce qu'il est, et `libellePente` est là pour que personne ne
 * puisse l'afficher autrement.
 */

export interface Pente {
  /** Pente en pourcentage, toujours positive : une descente est une pente. */
  pourcent: number
  /** Longueur du segment sur lequel cette moyenne a été faite, en mètres. */
  surMetres: number
}

/**
 * La longueur en deçà de laquelle une pente n'est pas calculée (issue #316).
 *
 * **Ce nombre est mesuré, pas choisi** — c'est le pas auquel le service
 * altimétrique de la Géoplateforme répond réellement sous la ressource
 * `ign_rge_alti_wld`, appelée par `src/core/elevation.ts`. Le §2 distingue un
 * seuil inventé d'un seuil établi ; celui-ci est de la seconde espèce, comme
 * les 24 px de WCAG 2.5.8 ailleurs dans ce dépôt.
 *
 * ## Ce que le service dit de lui-même, mesuré
 *
 * La mesure 7 de `tests/unit/mesuresReseau.test.ts` l'interroge :
 *
 * - il se nomme « Pyramide RGE Alti France Entière (Métropole, DOM et COM
 *   couvertes) » ;
 * - il déclare une exactitude **« Variable suivant la source de mesure »** :
 *   il refuse d'en donner une seule ;
 * - hors de cette emprise il ne rend rien — Berne, Turin et Barcelone
 *   répondent `-99999`, le témoin de non-couverture que `elevation.ts` filtre
 *   déjà. La Guadeloupe et Chamonix rendent une altitude.
 *
 * ## Une justification qui était fausse
 *
 * Ce commentaire disait, jusqu'au 28/08 : « la ressource est un assemblage
 * mondial ; sur la France métropolitaine elle sert du RGE ALTI fin, ailleurs
 * un modèle mondial bien plus grossier », et c'est de là qu'il tirait le
 * choix de 5 plutôt que 1.
 *
 * **Il n'y a pas d'ailleurs.** Le suffixe `_wld` m'avait fait écrire une
 * histoire plausible ; les trois `-99999` la réfutent. Une justification
 * vieillit comme le reste, et celle-là était fausse dès l'écriture (§4bis).
 *
 * ## Ce qui l'établit, mesuré le 29/08
 *
 * La question était restée ouverte parce qu'on la posait au mauvais endroit :
 * on cherchait la finesse à laquelle l'IGN **publie**, dans une fiche produit
 * rendue par script et illisible autrement. Or ce qui décide ici est la
 * finesse à laquelle le service **nous répond** — un modèle publié au mètre
 * mais reéchantillonné en chemin ne nous donnerait pas le mètre.
 *
 * Elle se mesure. Un profil demandé le long d'une droite rend un escalier :
 * l'altitude ne change qu'en changeant de cellule. La mesure 8 de
 * `tests/unit/mesuresReseau.test.ts` relève, sur trois versants distants de
 * plus de cent kilomètres — Chartreuse, Belledonne, Pilat :
 *
 * - **3,0 à 3,5 m** vers l'est, **4,3 à 4,8 m** vers le nord ;
 * - la même chose aux trois sites, et **indépendamment de la pente**, relevée
 *   de 10 % à 86 %.
 *
 * Le contrôle est ce qui rend la mesure valable : la même portion de terrain
 * est demandée avec 16, 31, 61 puis 121 points, et le nombre d'altitudes
 * distinctes ne bouge pas. L'escalier est donc dans le sol, pas dans la
 * requête. Sans cette colonne-là, on aurait mesuré sa propre sonde — §1bis.
 *
 * **Le plancher de 5 m tombe juste au-dessus de la plus longue marche.** Il
 * tient, et 1 m — l'autre candidat de l'issue — aurait été faux d'un facteur
 * quatre.
 *
 * Ce que la mesure ne dit pas : à quel pas RGE ALTI est publié. On n'a mesuré
 * que ce qui nous est servi, et c'est la seule chose que ces chiffres
 * autorisent à affirmer.
 *
 * Ce que ce plancher change concrètement, et qui ne dépend pas de ce débat :
 * une dénivelée de 3 m sur 40 cm — deux nœuds OSM d'une courbe serrée —
 * donnait 750 %. Sous ce plancher, elle ne donne plus rien du tout, et la
 * fiche le dit.
 */
export const PAS_MINIMAL_METRES = 5

/**
 * Ce qu'on sait de la pente d'un itinéraire — y compris quand on n'en sait
 * rien, et pourquoi.
 *
 * Trois états plutôt qu'un `Pente | null`, parce que « pas d'altitude » et
 * « des altitudes trop rapprochées pour en tirer une pente » ne se disent pas
 * de la même façon à l'écran : la première n'appelle aucune phrase, la
 * seconde en appelle une. Les confondre était précisément ce qui faisait
 * afficher 822 % : le module n'avait pas de mot pour « je ne peux pas
 * mesurer ça ».
 */
export type MesureDePente =
  | { etat: 'mesuree'; pente: Pente }
  | { etat: 'trop-fine'; pasLePlusLong: number }
  | { etat: 'sans-altitude' }

/**
 * La plus forte pente moyenne entre deux points d'altitude connus, **sur un
 * segment assez long pour que la mesure veuille dire quelque chose**.
 *
 * Les altitudes manquantes ne sont ni interpolées — ce serait inventer une
 * pente — ni comptées comme du plat — ce serait inventer un plat. Le segment
 * enjambe simplement le trou, et sa longueur le dit.
 */
export function penteMaximale(profil: ElevationProfile): MesureDePente {
  let precedent: { distance: number; altitude: number } | null = null
  let meilleure: Pente | null = null
  /*
    Retenu pour la phrase de repli : dire « pas mesurable » sans dire à
    quelle finesse laisserait quelqu'un supposer que la donnée manque, alors
    qu'elle est là et qu'elle est trop dense.
  */
  let pasLePlusLong = 0
  let deuxAltitudes = false

  for (let i = 0; i < profil.distances.length; i += 1) {
    const distance = profil.distances[i]
    const altitude = profil.elevations[i]
    if (typeof distance !== 'number' || typeof altitude !== 'number') continue
    if (!Number.isFinite(distance) || !Number.isFinite(altitude)) continue

    if (precedent !== null) {
      deuxAltitudes = true
      const longueur = distance - precedent.distance
      if (longueur > pasLePlusLong) pasLePlusLong = longueur
      /*
        La garde d'avant s'écrivait `longueur > 0`. Elle protégeait de la
        division par exactement zéro — et le faisait — mais pas de la
        division par un nombre presque nul, qui est le cas courant : deux
        nœuds OSM à quarante centimètres l'un de l'autre.
      */
      if (longueur >= PAS_MINIMAL_METRES) {
        const denivele = Math.abs(altitude - precedent.altitude)
        const pourcent = (denivele / longueur) * 100
        if (meilleure === null || pourcent > meilleure.pourcent) {
          meilleure = { pourcent, surMetres: longueur }
        }
      }
    }
    precedent = { distance, altitude }
  }

  if (meilleure !== null) return { etat: 'mesuree', pente: meilleure }
  if (deuxAltitudes) return { etat: 'trop-fine', pasLePlusLong }
  return { etat: 'sans-altitude' }
}

/**
 * La plus forte pente parmi plusieurs morceaux de chemin (issue #323).
 *
 * Sur une relation trouée, le profil enjambe les interruptions en ligne
 * droite : une pente calculée d'un bord à l'autre d'un trou de huit cents
 * mètres mesure une falaise que personne ne montera, parce que personne n'y
 * passera. `tronconsContinus` sépare les morceaux ; celle-ci prend le pire de
 * chacun.
 *
 * Quand aucun morceau n'est mesurable, l'état rendu est celui qui explique le
 * mieux : « trop fine » l'emporte sur « sans altitude », parce qu'il y a
 * quelque chose à dire.
 */
export function penteMaximaleSurTroncons(
  troncons: ElevationProfile[],
): MesureDePente {
  let meilleure: Pente | null = null
  let pasLePlusLong: number | null = null

  for (const troncon of troncons) {
    const mesure = penteMaximale(troncon)
    if (mesure.etat === 'mesuree') {
      if (meilleure === null || mesure.pente.pourcent > meilleure.pourcent) {
        meilleure = mesure.pente
      }
    } else if (mesure.etat === 'trop-fine') {
      pasLePlusLong = Math.max(pasLePlusLong ?? 0, mesure.pasLePlusLong)
    }
  }

  if (meilleure !== null) return { etat: 'mesuree', pente: meilleure }
  if (pasLePlusLong !== null) return { etat: 'trop-fine', pasLePlusLong }
  return { etat: 'sans-altitude' }
}

/**
 * La phrase qui accompagne le chiffre — et qui ne doit jamais être remplacée
 * par le chiffre seul.
 *
 * « Pente maximale 6 % » se lit « nulle part plus de 6 % ». C'est faux à cette
 * résolution, et faux au détriment de quelqu'un qui en dépend pour décider
 * de s'engager ou non.
 *
 * Rend `null` — et seulement dans ce cas — quand il n'y a pas d'altitude du
 * tout : il n'y a alors rien à dire, et « pas mesurable à cette résolution »
 * serait faux, puisque ce n'est pas la résolution qui manque.
 */
export function libellePente(mesure: MesureDePente): string | null {
  if (mesure.etat === 'sans-altitude') return null

  if (mesure.etat === 'trop-fine') {
    /*
      Taire perdrait une information : qui cherche la pente conclurait « pas
      de pente », alors que la vérité est « pas mesurable ici ». C'est la
      moitié du §2 qui se décide au lieu de se mesurer, et elle est tranchée
      ici — dire — parce que le silence se lit comme une réponse.
    */
    return (
      `pas mesurable sur cet itinéraire — les points d’altitude y sont ` +
      `distants de moins de ${String(PAS_MINIMAL_METRES)} m, le pas du modèle de terrain, ` +
      `et une pente calculée là-dessus mesurerait le modèle et non le sol.`
    )
  }

  const pourcent = mesure.pente.pourcent.toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })
  /*
    Sous cent mètres, l'arrondi à la dizaine rendait « 0 m » — la moitié du
    défaut de l'issue #316, et celle qui restait après le plancher : un
    segment de 6 m est mesurable, et « sur 0 m » le contredisait.
  */
  const sur =
    mesure.pente.surMetres < 100
      ? Math.round(mesure.pente.surMetres)
      : Math.round(mesure.pente.surMetres / 10) * 10
  return `jusqu’à ${pourcent} % en moyenne sur ${String(sur)} m — une rampe plus courte et plus raide ne se verrait pas à cette résolution.`
}
