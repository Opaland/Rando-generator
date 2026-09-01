/**
 * Le réseau, coupé pour toute la suite unitaire (issue #456).
 *
 * ## Ce que ça répare
 *
 * Le 01/09, la CI a rougi sur un test qui exerçait `loadAutour` : cette
 * action enchaîne sur un chargement de zone, et sans neutralisation ce
 * chargement part **vraiment** vers Overpass. Localement `fetch` échoue en
 * quelques millisecondes et la porte était verte ; sur le runner il résout
 * et attend, et deux questions dépassaient les cinq secondes.
 *
 * Le test mesurait donc, sans le dire, ce que le réseau de la machine veut
 * bien faire. C'est la famille du §6ter : une mesure d'un état qui met un
 * temps non nul à s'établir, et dont la durée n'appartient pas au test.
 *
 * ## Pourquoi ici, et pas un helper à importer
 *
 * `tests/unit/oubliDuCacheDeZone.test.ts` portait déjà cette précaution, et
 * son commentaire la justifiait — je l'avais lu une heure avant d'écrire le
 * test qui a cassé la CI. **Un bon commentaire dans un autre fichier ne
 * protège pas le fichier suivant** : c'est le §4ter vu depuis les tests, et
 * le remède qu'il nomme est une garde, pas une bonne intention.
 *
 * Un helper à importer aurait le même défaut : il faut penser à l'appeler.
 * Ici la coupure est **par défaut**, et couvre les fichiers qu'on n'a pas
 * encore écrits — le seul remède au mode d'échec observé (§6quater : s'il
 * faut le lire, il ne garde rien).
 *
 * ## Ce que ça ne prétend pas faire
 *
 * Ce n'est pas un échec dur. `fetch` **rejette** au lieu de pendre, et le
 * code applicatif qui attrape l'erreur — `loadFromOverpass` remplit
 * `zoneError` — continue son chemin. La garantie n'est donc pas « aucun test
 * ne touche au réseau » mais « aucun test ne dépend de ce que le réseau
 * répond » : le comportement est identique ici et sur le runner.
 *
 * Un échec dur casserait les tests qui déclenchent légitimement un
 * chargement dont ils ne mesurent pas l'issue.
 *
 * ## La mesure qui a décidé de cette forme
 *
 * Sonde jetable du 01/09 : `fetch` enveloppé pour journaliser ses appels, sur
 * la suite entière. **Zéro appel réseau** sur 2 238 tests — donc rien ne
 * dépendait d'un vrai `fetch`, et la coupure globale ne retire rien. La même
 * sonde, le bouchon local de `oubliDesLieux.test.ts` retiré, relevait quatre
 * appels vers les deux miroirs Overpass : elle voyait bien ce qu'elle
 * cherchait (§1).
 *
 * ## Le message vit à côté, et c'est une leçon
 *
 * `messageDeReseauCoupe.ts` porte le texte seul. La première version le
 * gardait ici : le test qui vérifie que `setupFiles` est branché l'importait
 * donc de ce fichier, **et cet import installe la coupure**. Retirer la
 * ligne de `vite.config.ts` ne le faisait pas rougir. Une garde qui ne peut
 * pas échouer ne garde rien.
 */

import { RESEAU_COUPE } from './messageDeReseauCoupe.ts'

globalThis.fetch = (entree) => {
  const url =
    typeof entree === 'string'
      ? entree
      : entree instanceof URL
        ? entree.href
        : entree.url
  return Promise.reject(new Error(`${RESEAU_COUPE} (${url})`))
}
