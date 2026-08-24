import { describe, it, expect } from 'vitest'
import type { Network } from '../../src/core/types.ts'
import { NETWORK_BADGES } from '../../src/lib/networkDisplay.ts'

/**
 * Trois feuilles peignent le badge de réseau — la carte de la liste, la
 * ligne de la liste, la fiche détail — et **chacune écrit ses classes à la
 * main**, une par réseau. TypeScript ne voit rien passer : le composant fait
 * `styles[itin.network]`, qui rend `undefined` sans se plaindre. Le badge
 * s'affiche alors sur le fond par défaut, c'est-à-dire le rouge des GR.
 *
 * C'est le mode d'échec du §4 dans sa forme la plus pure : une condition
 * transverse recopiée en trois exemplaires. On ne peut pas la nommer ici —
 * les modules CSS n'ont pas de boucle — mais on peut refuser qu'elle
 * diverge, et c'est ce que fait ce test.
 *
 * Découvert en ajoutant `INCONNU` (issue #284) : les trois feuilles étaient
 * à mettre à jour, et rien n'aurait signalé qu'il en manquait une.
 */

const feuilles: Record<string, string> = import.meta.glob<string>(
  '../../src/components/Itinerary*.module.css',
  { query: '?raw', import: 'default', eager: true },
)

/**
 * `PERSO` n'apparaît pas dans la liste filtrable mais bien dans les badges :
 * on part donc de tous les réseaux, sans exception à maintenir.
 */
const RESEAUX = Object.keys(NETWORK_BADGES) as Network[]

describe('chaque feuille de badge connaît chaque réseau', () => {
  for (const [chemin, brut] of Object.entries(feuilles)) {
    const nom = chemin.replace('../../', '')
    // Une feuille qui ne peint aucun badge n'est pas concernée.
    if (!/^\.GR\s*\{/m.test(brut)) continue
    it.each(RESEAUX)(`${nom} peint %s`, (reseau) => {
      expect(
        new RegExp(`^\\.${reseau}\\s*\\{`, 'm').test(brut),
        `le badge ${reseau} n’a pas de classe ici : il s’affichera sur le fond par défaut`,
      ).toBe(true)
    })
  }
})
