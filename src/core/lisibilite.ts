import type { Network } from './types.ts'
import { RESEAUX_FILTRABLES } from './reseaux.ts'

/**
 * Ce qui ne s'impose pas à l'écran tant que personne ne le demande (#322).
 *
 * Cédric, le 25/08 : « pour les GR, les cacher par défaut, ils nuisent à la
 * lecture », et sur les **trois** surfaces. Ce n'est pas une question de
 * goût, c'est une question d'échelle. Mesuré sur trois fiches relues le même
 * jour :
 *
 * | | longueur | points d'intérêt |
 * |---|---|---|
 * | Au cœur des Monts d'Or | 8,6 km | 44 |
 * | Rando Saint-Joseph | 0,5 km | 7 |
 * | Via Lugdunum | **153 km** | **~330** |
 *
 * Un GR traverse la zone de part en part. Sur la carte il barre l'écran ;
 * dans la liste il occupe une ligne qui vaut trente boucles.
 *
 * ## Pourquoi une garde nommée, et pas deux conditions
 *
 * La liste et la carte doivent répondre **la même chose**. Deux
 * `network !== 'GR'` écrits séparément, c'est le §4ter mot pour mot.
 *
 * Et ici elles divergeraient à l'usage, pas seulement sur le papier : rendre
 * le GR à la liste sans le rendre à la carte donnerait une ligne cliquable
 * dont le tracé n'apparaît nulle part. C'est pourquoi le choix vit dans le
 * store — une seule réponse, deux lecteurs — plutôt qu'en double.
 *
 * ## Ce que ce module ne décide pas
 *
 * **Ce qu'est un « GR ».** Il prend la classification que `classifyNetwork`
 * a lue dans les tags OSM (`network=nwn`, ou un `ref` préfixé), et rien
 * d'autre. Replier « au-delà de N kilomètres » changerait ce qui est montré
 * sur un nombre que rien ne fixe : le §2 l'interdit tant qu'on n'a pas
 * regardé la distribution des longueurs sur une zone réelle.
 *
 * **Ce trou est fermé depuis le 30/08** (#335). `network=iwn` n'était pas
 * lu : un itinéraire international sans `ref` exploitable ressortait
 * `INCONNU` et échappait au repli — c'est-à-dire que la Via Lugdunum, citée
 * ci-dessus comme le motif même du repli, était le seul des trois à ne pas
 * être replié. Elle ressort maintenant `INTERNATIONAL`, et ce réseau est
 * replié par défaut au même titre que le GR.
 */

/**
 * Les réseaux qu'on ne dessine pas d'emblée.
 *
 * Le second est arrivé le 30/08, et par le chemin que la forme prévoyait :
 * une liste, un ajout, et rien ailleurs. `INTERNATIONAL` y entre pour la
 * raison exacte qui y a mis `GR` — la Via Lugdunum est le cas mesuré du
 * tableau ci-dessus, 153 km et ~330 points d'intérêt, et elle est
 * internationale, pas nationale.
 */
export const RESEAUX_REPLIES_PAR_DEFAUT: readonly Network[] = [
  'INTERNATIONAL',
  'GR',
]

/** Les réseaux montrés au premier écran. */
export function reseauxVisiblesParDefaut(): Network[] {
  return RESEAUX_FILTRABLES.filter(
    (reseau) => !RESEAUX_REPLIES_PAR_DEFAUT.includes(reseau),
  )
}

/**
 * Ce qui reste à l'écran une fois le filtre de réseau appliqué.
 *
 * Générique sur la forme : la carte lui passe des itinéraires, un test lui
 * passe ce qu'il veut, et la fonction n'a besoin que du réseau.
 *
 * **Filtrer les itinéraires, et non les chemins**, est ce qui rend juste le
 * cas partagé : un chemin porté à la fois par un GR et un PR reste dessiné,
 * aux couleurs du PR, parce que le PR est encore là pour le réclamer. Le
 * filtrage en aval, sur les chemins déjà fusionnés, l'aurait fait
 * disparaître avec le GR.
 */
export function itinerairesVisibles<T extends { network: Network }>(
  itineraires: readonly T[],
  visibles: ReadonlySet<Network>,
): T[] {
  return itineraires.filter((i) => visibles.has(i.network))
}

/**
 * Ce qui a été retiré, par réseau, dans l'ordre de la charte.
 *
 * Rendre le compte plutôt qu'une phrase toute faite : le §2 range la
 * formulation du côté de ce qui se décide, et une phrase française dans
 * `core` serait une décision de présentation déguisée en calcul.
 *
 * Les réseaux dont **rien** n'est masqué n'y figurent pas : annoncer
 * « 0 PR masqués » ferait croire à un filtre actif là où il n'y a rien à
 * montrer.
 */
export function comptesMasques(
  itineraires: readonly { network: Network }[],
  visibles: ReadonlySet<Network>,
): { network: Network; nombre: number }[] {
  const comptes = new Map<Network, number>()
  for (const i of itineraires) {
    if (visibles.has(i.network)) continue
    comptes.set(i.network, (comptes.get(i.network) ?? 0) + 1)
  }
  return RESEAUX_FILTRABLES.filter((n) => (comptes.get(n) ?? 0) > 0).map(
    (n) => ({ network: n, nombre: comptes.get(n) as number }),
  )
}

/**
 * Combien de points d'intérêt s'affichent avant que le reste se replie
 * (#322, volet 1).
 *
 * ## Ce que la liste longue coûte vraiment
 *
 * L'issue disait « la liste des points d'intérêt fait plusieurs écrans avant
 * qu'on ait vu le profil ». **C'est faux, et je l'ai écrit** : le profil
 * altimétrique est au-dessus dans la fiche. Ce que la liste enterre est ce
 * qui la suit — et ce qui la suit est l'avertissement sur le couchage libre :
 *
 * > « Couchage libre » regroupe refuges non gardés, cabanes et appentis :
 * > gratuits et sans réservation, mais ni garantis ouverts ni entretenus.
 *
 * Quelqu'un qui prépare une nuit dehors doit donc faire défiler trois cents
 * entrées pour lire la phrase qui le concerne le plus. Le motif du repli est
 * celui-là, pas celui que j'avais écrit.
 *
 * ## Le seuil, et pourquoi il se tranche
 *
 * Il ne change **pas ce qui est calculé** : les points écartés restent
 * comptés, situés et annoncés. Il ne change que l'ordre dans lequel on les
 * rencontre. Le §2 le range donc du côté de ce qui se décide au jugement — à
 * condition d'écrire les pistes envisagées et écartées, ce que voici.
 *
 * Les trois seules fiches réelles dont ce dépôt ait le compte :
 *
 * | fiche | points |
 * |---|---|
 * | Rando Saint-Joseph | 7 |
 * | Au cœur des Monts d'Or | 44 |
 * | Via Lugdunum | ~330 |
 *
 * - **tout replier derrière un bouton** : une fiche de sept points coûterait
 *   un clic pour rien, et c'est le cas courant ;
 * - **replier au-delà de N écrans** : ce serait la bonne mesure, et elle
 *   n'existe pas ici — une hauteur en pixels dépend de l'appareil, de la
 *   taille de texte et du nombre de lignes de chaque entrée. Un module de
 *   `core` ne peut pas la connaître, et la faire remonter du DOM ferait
 *   dépendre un calcul d'une mise en page ;
 * - **replier par distance de détour** : c'est déjà le travail du rayon de
 *   #318, et c'est une autre question — « est-ce sur mon chemin » n'est pas
 *   « y en a-t-il trop à lire » ;
 * - **douze**, retenu : au-dessus des sept d'une fiche courte réelle, donc
 *   une fiche courte ne gagne jamais de clic ; assez bas pour que les deux
 *   grosses se replient.
 *
 * Ce n'est pas un seuil emprunté à une norme, contrairement aux 44 px de
 * WCAG 2.5.5 : c'est un nombre tranché ici, et il est écrit comme tel
 * (§6sexies).
 */
export const POIS_AVANT_REPLI = 12

/** Ce qu'on montre d'emblée, et ce qui attend un clic. */
export function replierLesPois<T>(
  pois: readonly T[],
): { montres: T[]; replies: T[] } {
  /*
    Un seul point de plus que le seuil ne se replie pas : le bouton
    « afficher 1 autre point » coûterait un geste pour gagner une ligne, et
    ferait deux lignes là où il y en avait une.
  */
  if (pois.length <= POIS_AVANT_REPLI + 1) return { montres: [...pois], replies: [] }
  return {
    montres: pois.slice(0, POIS_AVANT_REPLI),
    replies: pois.slice(POIS_AVANT_REPLI),
  }
}
