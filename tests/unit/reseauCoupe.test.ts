import { describe, it, expect } from 'vitest'
import { RESEAU_COUPE } from './messageDeReseauCoupe.ts'

/**
 * La garde qui garde la garde (issue #456).
 *
 * `tests/unit/reseauCoupe.ts` n'est branché que par une ligne de
 * `vite.config.ts` (`setupFiles`). Une ligne se retire par mégarde, et rien
 * ne le dirait : la suite resterait verte ici et redeviendrait dépendante du
 * réseau sur le runner — exactement le défaut d'origine, revenu en silence.
 *
 * Ce fichier ferme cette porte. Retirer `setupFiles` le fait rougir.
 *
 * ## Et la première version de ce fichier ne gardait rien
 *
 * Elle importait `RESEAU_COUPE` de `reseauCoupe.ts` — **et cet import
 * installe la coupure**. Le test passait donc `setupFiles` retiré, ce que
 * l'injection a montré tout de suite. Le message vit maintenant dans
 * `messageDeReseauCoupe.ts`, qu'on peut lire sans rien déclencher.
 *
 * Vérifié en retirant la ligne (§1) : sans elle, `fetch` part vraiment sur
 * le réseau et l'erreur qui revient — s'il en revient une — ne porte pas ce
 * message.
 */
describe('le réseau de la suite unitaire', () => {
  it('est coupé par défaut, sans que ce fichier ait rien à faire', async () => {
    await expect(fetch('https://overpass-api.de/api/interpreter')).rejects.toThrow(
      RESEAU_COUPE,
    )
  })

  it('nomme l’adresse demandée, pour qu’on sache quoi bouchonner', async () => {
    await expect(fetch('https://exemple.invalide/quelque-chose')).rejects.toThrow(
      'https://exemple.invalide/quelque-chose',
    )
  })

  it('accepte aussi une URL, pas seulement une chaîne', async () => {
    // `new URL(...)` est une entrée légitime de `fetch` : la traiter comme
    // « [object URL] » rendrait le message inutile là où il sert le plus.
    await expect(fetch(new URL('https://exemple.invalide/via-url'))).rejects.toThrow(
      'https://exemple.invalide/via-url',
    )
  })
})
