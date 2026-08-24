import { describe, it, expect } from 'vitest'
import {
  POI_COLORS,
  POI_FAMILLES,
  type FamillePoi,
} from '../../src/lib/poiDisplay.ts'
import {
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../src/lib/networkDisplay.ts'
import { PAPIER } from '../../src/lib/couleursPartagees.ts'
import type { PoiKind } from '../../src/core/types.ts'

/**
 * Le code couleur des points d'intérêt (demande de Cédric, 23/08).
 *
 * Douze teintes posées une par une au fil des lots ne font pas un code. Ce
 * fichier tient les trois règles qui le rendent lisible, **en les
 * calculant** plutôt qu'en recopiant des valeurs : une teinte changée au
 * jugement rougit ici si elle sort du code, ce qu'une liste de constantes
 * recopiées n'aurait jamais dit.
 *
 * Les trois règles, et ce que chacune a trouvé en arrivant :
 *
 * 1. **une pastille se voit** — contraste ≥ 3:1 contre le liseré de papier
 *    qui l'entoure ;
 * 2. **une pastille n'est pas un tracé** — ΔE ≥ 20 de chaque couleur de
 *    balisage et du bleu de la position. `hut` valait *exactement* le rouge
 *    GR et `water` *exactement* le bleu « où suis-je » ;
 * 3. **deux pastilles se distinguent** — ΔE ≥ 20 entre familles, ≥ 15 à
 *    l'intérieur d'une famille, où la ressemblance est voulue. `ruins` et
 *    `marker` étaient à 11,7.
 *
 * Les seuils sont des seuils de **présentation** : ils ne changent aucun
 * calcul, seulement ce qu'on montre, et CLAUDE.md §2 autorise à les trancher
 * au jugement à condition de dire ce qui a été écarté. 3:1 est le plancher
 * WCAG pour un élément non textuel. ΔE 20 en CIE76 est posé au jugement,
 * faute d'étude sur des pastilles de six pixels : c'est deux fois le seuil
 * usuel de « différence nette » sur un aplat large, et l'écart qui manquait
 * exactement à `ruins`/`marker`. Ce qu'il faudrait pour trancher mieux :
 * montrer la carte à quelqu'un et lui demander de nommer deux pastilles
 * voisines.
 *
 * CIE76 plutôt que CIEDE2000 : la formule tient en dix lignes ici, sans
 * dépendance, et c'est ce qui permet de la lire. Elle est un peu sévère
 * dans les bleus, ce qui va dans le bon sens pour un garde-fou.
 */

const LISERE = PAPIER

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

/** Coordonnées CIE L*a*b*, D65, pour comparer des couleurs comme un œil. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [0, 1, 2].map((i) => lineaire(canal(hex, i))) as [
    number,
    number,
    number,
  ]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function ecart(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

const KINDS = Object.keys(POI_COLORS) as PoiKind[]

/** Ce que la carte peint déjà, et qui veut dire autre chose qu'un POI. */
const DEJA_PRISES: Record<string, string> = {
  ...NETWORK_COLORS,
  position: POSITION_COLOR,
}

describe('règle 1 — une pastille se voit', () => {
  it.each(KINDS)('%s tranche sur son liseré de papier', (kind) => {
    expect(contraste(POI_COLORS[kind], LISERE)).toBeGreaterThanOrEqual(3)
  })
})

describe('règle 2 — une pastille n’est pas un tracé', () => {
  it.each(KINDS)('%s ne se confond avec aucune couleur déjà prise', (kind) => {
    for (const [nom, couleur] of Object.entries(DEJA_PRISES)) {
      const distance = ecart(POI_COLORS[kind], couleur)
      expect(
        distance,
        `${kind} (${POI_COLORS[kind]}) est à ΔE ${distance.toFixed(1)} de ${nom} (${couleur})`,
      ).toBeGreaterThanOrEqual(20)
    }
  })

  /**
   * Les deux collisions trouvées le 23/08, gardées nommément. Le test
   * ci-dessus les couvre déjà ; celui-ci dit **lesquelles** c'étaient, pour
   * que le jour où l'une revient, le message le rappelle.
   */
  it('ne revient pas au rouge GR pour un refuge, ni au bleu de la position pour l’eau', () => {
    expect(POI_COLORS.hut).not.toBe(NETWORK_COLORS.GR)
    expect(POI_COLORS.water).not.toBe(POSITION_COLOR)
  })
})

describe('règle 3 — deux pastilles se distinguent', () => {
  const paires: [PoiKind, PoiKind][] = KINDS.flatMap((a, i) =>
    KINDS.slice(i + 1).map((b) => [a, b] as [PoiKind, PoiKind]),
  )

  it.each(paires)('%s et %s ne se confondent pas', (a, b) => {
    const memeFamille = POI_FAMILLES[a] === POI_FAMILLES[b]
    const seuil = memeFamille ? 15 : 20
    const distance = ecart(POI_COLORS[a], POI_COLORS[b])
    expect(
      distance,
      `${a}/${b} : ΔE ${distance.toFixed(1)} (${memeFamille ? 'même' : 'autre'} famille, seuil ${String(seuil)})`,
    ).toBeGreaterThanOrEqual(seuil)
  })
})

describe('les familles', () => {
  it('rangent chaque catégorie, sans en oublier', () => {
    expect(Object.keys(POI_FAMILLES).sort()).toEqual([...KINDS].sort())
  })

  /**
   * Le déplacement qui compte : l'abri météo a quitté la famille des
   * couchages. « On n'y dort pas » est la distinction que les issues #23 puis
   * #161 ont défendue, et elle se lisait jusqu'ici seulement en ouvrant la
   * fiche.
   */
  it('mettent l’abri météo avec la halte, pas avec les couchages', () => {
    expect(POI_FAMILLES.shelter).toBe('halte')
    expect(POI_FAMILLES.hut).toBe('dormir')
    expect(POI_FAMILLES.gite).toBe('dormir')
    expect(POI_FAMILLES.bivouac).toBe('dormir')
  })

  /**
   * À l'intérieur de la famille « dormir », la clarté dit ce qu'il faut
   * avoir prévu : gardé le plus foncé, libre le plus clair. C'est ce qui
   * fait un code plutôt qu'un assortiment — et ça se vérifie.
   */
  it('éclaircissent le couchage à mesure qu’il se réserve moins', () => {
    const clarte = (kind: PoiKind): number => lab(POI_COLORS[kind])[0]
    expect(clarte('hut')).toBeLessThan(clarte('gite'))
    expect(clarte('gite')).toBeLessThan(clarte('bivouac'))
  })

  it('couvrent cinq familles, et pas une par catégorie', () => {
    const familles = new Set<FamillePoi>(Object.values(POI_FAMILLES))
    expect(familles.size).toBe(5)
    expect(familles.size).toBeLessThan(KINDS.length)
  })
})
