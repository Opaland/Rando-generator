import type { Network } from './types.ts'

/**
 * Les réseaux, et l'ordre dans lequel on les nomme.
 *
 * ## Pourquoi ce module existe
 *
 * La liste des réseaux était écrite **deux fois à la main** : une fois dans
 * `legende.ts` pour l'ordre de la charte, une fois dans `ItineraryList.tsx`
 * pour les cases à cocher du panneau. Les deux fichiers ne changent jamais
 * ensemble, et chacune paraît complète quand on la lit seule — le §4ter mot
 * pour mot.
 *
 * Pire, le panneau portait cette phrase :
 *
 * > `tests/unit/reseauxFiltrables.test.ts` garde cette liste : TypeScript ne
 * > voit rien passer quand un réseau s'ajoute au type sans s'ajouter ici.
 *
 * **Ce fichier n'a jamais existé.** `git log --diff-filter=A` ne rend rien
 * sur aucune branche ; la phrase est arrivée avec 36d4d48, le jour où
 * `INCONNU` est né, et le test qu'elle annonce n'a jamais suivi. Le
 * diagnostic était juste, le remède imaginaire.
 *
 * C'est le §4bis dans sa forme la plus dure : les trois commentaires faux
 * qu'il raconte étaient au moins **vrais quand ils ont été écrits**. Celui-là
 * ne l'a jamais été.
 *
 * ## Ce que le module change
 *
 * Il ne garde pas deux listes d'accord : il n'en laisse **qu'une**. L'ordre
 * de la charte est écrit ici, une fois ; ce que le panneau filtre s'en
 * déduit. C'est le remède que le §4 nomme — une garde transverse se nomme,
 * elle ne se recopie pas — plutôt que le pansement qui consiste à surveiller
 * la copie.
 */

/**
 * L'ordre de la charte, et non celui d'arrivée des données.
 *
 * Du réseau le plus structurant au plus local, puis ce que la personne a
 * tracé, et enfin ce qu'on ne sait pas nommer. C'est un choix éditorial, pas
 * une conséquence : une liste dont les entrées changent de place selon la
 * zone chargée se relit à chaque fois.
 *
 * Elle reste écrite à la main pour cette raison — la dériver de l'ordre des
 * clés d'une table de couleurs ferait dépendre l'ordre d'affichage d'un
 * détail de rédaction. `tests/unit/listesDeReseaux.test.ts` la confronte à la
 * seule liste dont TypeScript tient l'exhaustivité.
 */
export const ORDRE_DES_RESEAUX: readonly Network[] = [
  // Le plus structurant des quatre niveaux d'OpenStreetMap (issue #335).
  'INTERNATIONAL',
  'GR',
  'GRP',
  'PR',
  'LOCAL',
  'PERSO',
  // En dernier, parce que ce n'est pas un réseau mais une absence de réseau
  // (issue #284).
  'INCONNU',
]

/**
 * Ce que le panneau « Trouver une sortie » propose de filtrer.
 *
 * `PERSO` en est la seule exception, et elle est **écrite** plutôt que
 * devinée : les itinéraires persos ont leur propre section dans la liste, et
 * une case « PERSO » parmi les réseaux balisés promettrait de les y mêler.
 *
 * `INCONNU` y figure au contraire, et c'est tout l'intérêt du #284 : pouvoir
 * demander « montre-moi ce dont on ne sait rien » — ou l'inverse, ne garder
 * que ce qui est déclaré balisé avant de choisir sa sortie du dimanche.
 */
export const RESEAUX_FILTRABLES: readonly Network[] = ORDRE_DES_RESEAUX.filter(
  (reseau) => reseau !== 'PERSO',
)
