import { describe, it, expect } from 'vitest'
import type { Network } from '../../src/core/types.ts'
import { NETWORK_BADGES } from '../../src/lib/networkDisplay.ts'
import {
  ORDRE_DES_RESEAUX,
  RESEAUX_FILTRABLES,
} from '../../src/core/reseaux.ts'

/**
 * La garde que `ItineraryList.tsx` annonçait depuis le 24/08, et qui
 * n'existait pas.
 *
 * Le commentaire nommait `tests/unit/reseauxFiltrables.test.ts` ; ce fichier
 * n'a jamais été ajouté au dépôt. La liste des réseaux filtrables était donc
 * gardée par une phrase, ce qui ne garde rien (§6quater : s'il faut le lire,
 * il ne garde rien — et ici, il n'y avait même pas quoi lire).
 *
 * ## Pourquoi `NETWORK_BADGES` sert d'étalon
 *
 * C'est un `Record<Network, string>` : TypeScript refuse de compiler s'il
 * manque une clé. De toutes les listes de réseaux du dépôt, c'est la seule
 * dont l'exhaustivité soit tenue par le compilateur — donc la seule qui
 * puisse servir de référence aux autres.
 *
 * ## Ce que ce test **ne** fait **pas**
 *
 * Il ne garde pas deux listes d'accord : il n'en reste qu'une. `legende.ts`
 * et le panneau lisent tous deux `ORDRE_DES_RESEAUX`, et
 * `RESEAUX_FILTRABLES` s'en déduit. Le test surveille donc le seul endroit
 * où un oubli est encore possible, plutôt que de courir après des copies.
 */

const TOUS = Object.keys(NETWORK_BADGES) as Network[]

describe('la liste des réseaux les connaît tous', () => {
  it('l’ordre de la charte n’en oublie aucun', () => {
    expect([...ORDRE_DES_RESEAUX].sort()).toEqual([...TOUS].sort())
  })

  it('n’en invente aucun non plus', () => {
    // Un réseau retiré du type et laissé ici peindrait une entrée de légende
    // sans couleur ni libellé.
    expect(TOUS).toEqual(expect.arrayContaining([...ORDRE_DES_RESEAUX]))
  })

  it('l’ordre est celui de la charte, du plus structurant au plus incertain', () => {
    /*
      Écrit en toutes lettres, et pas seulement « c'est une permutation » :
      l'ordre est un choix éditorial, et un test qui n'en garde que le
      contenu laisserait passer un `INCONNU` remonté en tête — précisément
      ce que le §284 a voulu éviter.
    */
    expect(ORDRE_DES_RESEAUX).toEqual([
      'GR',
      'GRP',
      'PR',
      'LOCAL',
      'PERSO',
      'INCONNU',
    ])
  })
})

describe('ce que le panneau filtre', () => {
  it('est tout, sauf les itinéraires persos', () => {
    expect(RESEAUX_FILTRABLES).toEqual(['GR', 'GRP', 'PR', 'LOCAL', 'INCONNU'])
  })

  it('garde l’ordre de la charte', () => {
    // Dérivée, pas recopiée : l'ordre suit sans qu'on ait à y penser.
    const attendu = ORDRE_DES_RESEAUX.filter((r) => r !== 'PERSO')
    expect(RESEAUX_FILTRABLES).toEqual(attendu)
  })
})
