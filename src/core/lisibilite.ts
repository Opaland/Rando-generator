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
 * **Et cette classification a un trou connu** : `network=iwn` — les
 * itinéraires internationaux, dont les chemins de Compostelle — n'est pas
 * lu, donc un tel itinéraire sans `ref` exploitable ressort `INCONNU` et
 * **échappe au repli**. C'est l'issue #335, et c'est précisément le cas de
 * la Via Lugdunum citée ci-dessus. Le repli livré ici ne la replie donc pas.
 */

/**
 * Les réseaux qu'on ne dessine pas d'emblée.
 *
 * Un seul aujourd'hui, et la forme reste une liste : le jour où un second
 * s'ajoute, il s'ajoute ici et nulle part ailleurs.
 */
export const RESEAUX_REPLIES_PAR_DEFAUT: readonly Network[] = ['GR']

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
