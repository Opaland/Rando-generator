import { describe, it, expect } from 'vitest'
import type { Network } from '../../src/core/types.ts'
import {
  NETWORK_BADGES,
  NETWORK_LABELS,
  NETWORK_EXPLANATIONS,
} from '../../src/lib/networkDisplay.ts'

/**
 * Les mots des réseaux, tenus comme les couleurs le sont déjà.
 *
 * ## Ce que la vague de mutation a mesuré, le 03/09
 *
 * `src/lib/networkDisplay.ts` rend 43,90 % — et le fichier se coupe en deux
 * d'un trait net :
 *
 * - `NETWORK_COLORS`, `NETWORK_COLOR_VARS`, `POSITION_COLOR` : **18 mutants,
 *   18 tués**. Trois gardes les tiennent — l'accord avec les jetons CSS
 *   (`couleurs.test.ts`), le contraste et le ΔE (`couleursDeReseau.test.ts`),
 *   les cinq feuilles de badge (`badgesDeReseau.test.ts`) ;
 * - `NETWORK_LABELS`, `NETWORK_BADGES`, `NETWORK_EXPLANATIONS` : **23 mutants,
 *   23 survivants**. Les vingt et un mots que l'application montre peuvent
 *   tous devenir la chaîne vide sans qu'un seul des 2 292 tests s'en aperçoive.
 *
 * Ce n'est donc pas « une table de traduction qui produit des survivants sans
 * intérêt » (§6bis) : la moitié colorée est gardée, la moitié écrite ne l'est
 * pas. Le score du fichier disait le mélange des deux, et ne pouvait pas le
 * dire.
 *
 * ## Ce que l'absence coûte, et pourquoi ce n'est pas hypothétique
 *
 * `NextOuting.module.css` porte déjà le récit d'un badge perdu — la classe de
 * couleur passait `undefined`, et « le badge existait, occupait sa place, et
 * ne montrait rien ». C'est exactement ce que produit un libellé vide, par
 * l'autre moitié de la même phrase. La couleur a reçu sa garde ce jour-là ;
 * le texte n'en a jamais eu.
 *
 * Et `listesDeReseaux.test.ts` **nomme** ce mode d'échec dans un commentaire —
 * « peindrait une entrée de légende sans couleur ni libellé » — au-dessus d'un
 * test qui ne vérifie que les clés. `Record<Network, string>` fait tenir au
 * compilateur l'existence de la clé ; la chaîne vide, elle, compile. Une
 * justification qui affirme, sans rien derrière : §4bis.
 *
 * ## Pourquoi ces questions-là, et pas la valeur des chaînes
 *
 * Réécrire les vingt et un mots dans un test en ferait la jumelle exacte de
 * la source — deux listes qui changent ensemble, qui disent la même chose, et
 * qui ont donc le même trou (§4ter). Ce fichier n'asserte que des
 * **propriétés** : qu'un mot existe, qu'il se distingue des autres, qu'il
 * apprenne quelque chose. La formulation reste libre.
 *
 * L'unicité est le pendant écrit du ΔE : `couleursDeReseau.test.ts` refuse
 * deux réseaux qu'on ne saurait distinguer à l'œil ; celui-ci refuse deux
 * réseaux qu'on ne saurait distinguer à la lecture.
 */

const RESEAUX = Object.keys(NETWORK_BADGES) as Network[]

/**
 * Un mot « porte des signes » s'il reste quelque chose à peindre une fois les
 * blancs retirés. `' '` n'est pas vide et ne montre rien : la question posée
 * est celle de ce qu'on voit, pas celle de la longueur (§1bis).
 */
function porteDesSignes(mot: string): boolean {
  return mot.trim().length > 0
}

const TABLES: [string, Record<Network, string>][] = [
  ['libellés', NETWORK_LABELS],
  ['badges', NETWORK_BADGES],
  ['explications', NETWORK_EXPLANATIONS],
]

describe('chaque réseau a des mots, et pas seulement des clés', () => {
  for (const [nom, table] of TABLES) {
    it(`les ${nom} sont tous écrits`, () => {
      const muets = RESEAUX.filter((r) => !porteDesSignes(table[r]))
      expect(muets).toEqual([])
    })
  }
})

describe('deux réseaux ne se disent jamais du même mot', () => {
  for (const [nom, table] of TABLES) {
    it(`les ${nom} se distinguent les uns des autres`, () => {
      /*
        Le pendant écrit du ΔE : deux entrées de légende portant le même mot
        sont aussi indistinguables que deux tracés de la même couleur, et le
        panneau de filtres afficherait deux cases identiques.
      */
      const vus = RESEAUX.map((r) => table[r])
      expect(new Set(vus).size).toBe(RESEAUX.length)
    })
  }
})

describe('une explication introduit le sigle (#145)', () => {
  it('ne se contente jamais de répéter le libellé', () => {
    /*
      #145 est né de ce que « rien ne les introduisait : quelqu'un qui débute
      ne sait pas si "PR" le concerne ». Une explication égale au libellé
      ramène exactement cet état, en occupant la place qui devait le corriger.
    */
    const steriles = RESEAUX.filter(
      (r) => NETWORK_EXPLANATIONS[r].trim() === NETWORK_LABELS[r].trim(),
    )
    expect(steriles).toEqual([])
  })
})
