import type { PoiKind } from './types.ts'

/**
 * Les catégories de points d'intérêt où l'on passe la nuit.
 *
 * **Cette liste vivait dans `stages.ts`, en privé**, sous un commentaire qui
 * disait : « il n'y aura pas de quatrième lecture de cette liste-ci ». Il y en
 * a une — l'issue #318 pose une exception au rayon de détour pour
 * l'hébergement — et elle arrive par un module qui ne pouvait pas importer
 * `stages.ts` sans traîner tout le découpage en étapes derrière elle.
 *
 * D'où ce fichier, qui ne contient que la question et sa réponse. C'est le
 * §4ter appliqué avant que le trou n'existe : deux listes qui disent la même
 * règle ont le même trou, et on ne sait pas qu'on recopie au moment où on le
 * fait.
 *
 * **`shelter` n'en est pas.** Un abri météo est une pause ou une urgence, pas
 * un endroit où dormir — `PoiKind` le dit déjà dans son propre commentaire, et
 * le confondre ferait proposer un auvent de trois mètres carrés comme couchage
 * d'étape. La question voisine et différente — « peut-on y dormir **sans
 * réservation** » — reste `POI_OVERNIGHT`, et c'est bien deux questions.
 */
const CATEGORIES_DE_COUCHAGE: ReadonlySet<PoiKind> = new Set<PoiKind>([
  /** Refuge gardé. */
  'hut',
  /** Refuge non gardé, cabane. */
  'bivouac',
  /** Gîte d'étape. */
  'gite',
])

/** Peut-on passer la nuit dans un point de cette catégorie ? */
export function estUnCouchage(kind: PoiKind): boolean {
  return CATEGORIES_DE_COUCHAGE.has(kind)
}
