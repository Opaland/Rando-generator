import { describe, it, expect } from 'vitest'
import {
  TERRAIN_COLORS,
  TERRAIN_LABELS,
  TERRAIN_PEINTES,
  TERRAIN_TIRETS,
} from '../../src/lib/revetementDisplay.ts'
import {
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../src/lib/networkDisplay.ts'
import { PAPIER } from '../../src/lib/couleursPartagees.ts'
import type { FamilleRevetement } from '../../src/core/revetement.ts'
import { ORDRE_TERRAIN } from '../../src/core/legende.ts'

/**
 * Le code couleur du terrain (demande de Cédric, 24/08 : « il faudrait
 * également avoir la couleur du terrain sur la carte »).
 *
 * Les bandes du profil altimétrique employaient `--jaune-pr` pour
 * « stabilisé » et `--bleu-local` pour « naturel » — les couleurs du
 * balisage. Tant qu'elles vivaient sous une courbe, où aucun tracé
 * n'apparaît, personne ne s'en apercevait. Sur la carte, un liseré jaune le
 * long d'un GR se lit comme un PR qui le longe.
 *
 * Les règles sont **calculées** ici, pas recopiées : une teinte changée au
 * jugement rougit avec le chiffre dans le message.
 */

function canal(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
}

function lineaire(valeur: number): number {
  const v = valeur / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => lineaire(canal(hex, i))) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (haut + 0.05) / (bas + 0.05)
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = [0, 1, 2].map((i) => lineaire(canal(hex, i))) as [
    number,
    number,
    number,
  ]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number): number =>
    t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function ecart(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Les autres **lignes** de la carte : c'est avec elles que la confusion existe. */
const AUTRES_TRACES: Record<string, string> = {
  ...NETWORK_COLORS,
  position: POSITION_COLOR,
}

/**
 * Les trois familles qui disent quelque chose. « Autre » est délibérément
 * neutre — donc grise, donc proche de « dur » — et se distingue par le
 * motif ; l'inclure dans la règle des teintes reviendrait à lui demander de
 * cesser d'être neutre.
 */
const PARLANTES: FamilleRevetement[] = ['dur', 'stabilise', 'naturel']

describe('le terrain ne se confond pas avec un balisage', () => {
  it.each(TERRAIN_PEINTES)('%s est loin de toute autre ligne', (famille) => {
    const couleur = TERRAIN_COLORS[famille]
    expect(couleur).not.toBeNull()
    for (const [nom, autre] of Object.entries(AUTRES_TRACES)) {
      const distance = ecart(couleur as string, autre)
      expect(
        distance,
        `${famille} (${String(couleur)}) est à ΔE ${distance.toFixed(1)} de ${nom} (${autre})`,
      ).toBeGreaterThanOrEqual(20)
    }
  })

  /**
   * La collision nommément gardée : « stabilisé » valait exactement le jaune
   * des PR, « naturel » le bleu-vert des boucles locales. Le test ci-dessus
   * les couvre ; celui-ci dit **lesquelles** c'étaient, pour que le message
   * le rappelle si l'une revient.
   */
  it('ne revient ni au jaune PR pour le stabilisé, ni au bleu local pour le naturel', () => {
    expect(TERRAIN_COLORS.stabilise).not.toBe(NETWORK_COLORS.PR)
    expect(TERRAIN_COLORS.naturel).not.toBe(NETWORK_COLORS.LOCAL)
  })
})

describe('les familles se distinguent', () => {
  const paires = PARLANTES.flatMap((a, i) =>
    PARLANTES.slice(i + 1).map((b) => [a, b] as [FamilleRevetement, FamilleRevetement]),
  )

  it.each(paires)('%s et %s ne se confondent pas', (a, b) => {
    const distance = ecart(
      TERRAIN_COLORS[a] as string,
      TERRAIN_COLORS[b] as string,
    )
    expect(distance, `${a}/${b} : ΔE ${distance.toFixed(1)}`).toBeGreaterThanOrEqual(20)
  })

  it.each(TERRAIN_PEINTES)('%s se voit sur le papier', (famille) => {
    expect(contraste(TERRAIN_COLORS[famille] as string, PAPIER)).toBeGreaterThanOrEqual(3)
  })
})

describe('ce qui ne se peint pas', () => {
  /**
   * Deux tiers d'un parcours n'ont pas de revêtement renseigné. Peindre
   * l'ignorance la ferait passer pour une valeur — c'est la règle que le
   * profil applique déjà en hachurant plutôt qu'en coloriant, et elle vaut
   * a fortiori sur la carte, où une ligne pleine est une affirmation.
   */
  it('l’inconnu n’a pas de couleur', () => {
    expect(TERRAIN_COLORS.inconnu).toBeNull()
    expect(TERRAIN_PEINTES).not.toContain('inconnu')
  })

  /**
   * « Autre » se distingue par la forme, ce qui tient sans la couleur —
   * pour qui ne sépare pas les gris comme pour qui regarde au soleil.
   */
  it('« autre » se dit par le motif', () => {
    expect(TERRAIN_TIRETS).toEqual(['autre'])
  })

  it('chaque famille porte un libellé, y compris celles qu’on ne peint pas', () => {
    const familles = Object.keys(TERRAIN_COLORS) as FamilleRevetement[]
    expect(Object.keys(TERRAIN_LABELS).sort()).toEqual([...familles].sort())
    for (const famille of familles) {
      expect(TERRAIN_LABELS[famille].length).toBeGreaterThan(2)
    }
  })
})

/**
 * Les deux listes qui doivent rester d'accord.
 *
 * `core/legende` décide ce que la légende nomme, et il le décide **sans**
 * consulter la table des couleurs : `core` ne dépend pas de `lib`, et
 * l'inverser ferait descendre une décision d'affichage dans le calcul. Il
 * écarte donc « inconnu » en vocabulaire du domaine — on ne nomme pas
 * l'ignorance.
 *
 * Cette indépendance a un prix : rien n'empêcherait une future famille de
 * cesser d'être peinte sans que la légende cesse de la nommer. C'est ce test
 * qui paie ce prix, et il est ici plutôt que dans `legende.test.ts` parce que
 * c'est la table des couleurs qui est la source de vérité de « ce qui se
 * peint ».
 */
describe('la légende et la peinture', () => {
  it('nomment exactement les mêmes familles', () => {
    expect([...ORDRE_TERRAIN].sort()).toEqual([...TERRAIN_PEINTES].sort())
  })
})
