import { describe, it, expect } from 'vitest'
import { NETWORK_COLORS } from '../../src/lib/networkDisplay.ts'
import { ORDRE_DES_RESEAUX } from '../../src/core/reseaux.ts'

/**
 * La lisibilité des couleurs de réseau en vision deutéranope (issue #360).
 *
 * Environ un homme sur douze ne sépare pas les rouges des verts. Ce fichier
 * mesure ce qu'il voit, plutôt que de l'espérer.
 *
 * ## Ce qu'il ne garde pas
 *
 * - Ni la beauté d'une teinte ni son adéquation au balisage réel : ça se
 *   décide, et le §2 interdit de prétendre le mesurer.
 * - Ni l'accord entre les trois endroits où la palette est écrite — les
 *   jetons de `src/index.css`, l'hexadécimal de `networkDisplay.ts` et les
 *   `var(--…)` de `ProgressBalise.tsx`. Cette garde-là lit des fichiers,
 *   donc elle vit dans `scripts/listes-jumelles.mjs` : `tests/unit` n'a pas
 *   les types Node, et c'est délibéré dans ce dépôt.
 */

/* ---------- simulation deutéranope et écart perceptif ---------- */

const canal = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const versOctet = (v: number): number => {
  const b = Math.max(0, Math.min(1, v))
  return 255 * (b <= 0.0031308 ? 12.92 * b : 1.055 * b ** (1 / 2.4) - 0.055)
}
const enRvb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

/**
 * Viénot, Brettel & Mollon (1999) — le modèle de référence pour simuler une
 * dichromatie. Le canal M est reconstruit depuis L et S : c'est ce que fait
 * un œil dépourvu de cônes verts.
 */
function deuteranope(rgb: [number, number, number]): [number, number, number] {
  const [r, v, b] = rgb.map(canal) as [number, number, number]
  const L = 0.31399022 * r + 0.63951294 * v + 0.04649755 * b
  const M = 0.15537241 * r + 0.75789446 * v + 0.08670142 * b
  const S = 0.01775239 * r + 0.10944209 * v + 0.87256922 * b
  void M
  const M2 = 0.9513092 * L + 0.04866992 * S
  return [
    versOctet(5.47221206 * L - 4.6419601 * M2 + 0.16963708 * S),
    versOctet(-1.1252419 * L + 2.29317094 * M2 - 0.1678952 * S),
    versOctet(0.02980165 * L - 0.19318073 * M2 + 1.16364789 * S),
  ]
}

function lab(rgb: [number, number, number]): [number, number, number] {
  const [r, v, b] = rgb.map(canal) as [number, number, number]
  const X = (0.4124 * r + 0.3576 * v + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * v + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * v + 0.9505 * b) / 1.08883
  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
  const [fx, fy, fz] = [f(X), f(Y), f(Z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function ecart(a: [number, number, number], b: [number, number, number]): number {
  const [la, aa, ba] = lab(a)
  const [lb, ab, bb] = lab(b)
  return Math.hypot(la - lb, aa - ab, ba - bb)
}

/**
 * Le seuil de 20 est un **repère**, pas une norme : WCAG ne dit rien des
 * écarts entre deux couleurs de contenu, seulement du contraste texte/fond.
 * ΔE 20 est l'ordre de grandeur communément retenu pour deux aplats
 * distinguables sans effort. Il est écrit ici pour être discuté, pas pour
 * faire autorité (§2).
 */
const ECART_LISIBLE = 20

/**
 * Le défaut ouvert de #360, nommé plutôt que tu.
 *
 * Ce test ne demande pas que toutes les paires passent — elles ne passent
 * pas, et prétendre le contraire rendrait la suite verte sur un défaut
 * connu. Il **épingle l'état mesuré** : la paire GR/GRP s'effondre, les neuf
 * autres tiennent. Le jour où quelqu'un touche à la palette, ce test dira si
 * la situation s'améliore ou empire, avec le chiffre.
 */
const PAIRE_CONFONDUE: readonly [string, string] = ['GR', 'GRP']

describe('lisibilité en vision deutéranope (#360)', () => {
  it('une seule paire est confondue, et c’est celle que #360 nomme', () => {
    const confondues: string[] = []
    const visibles = ORDRE_DES_RESEAUX.filter((r) => r !== 'PERSO')
    for (let i = 0; i < visibles.length; i += 1) {
      for (let j = i + 1; j < visibles.length; j += 1) {
        const a = deuteranope(enRvb(NETWORK_COLORS[visibles[i]!]))
        const b = deuteranope(enRvb(NETWORK_COLORS[visibles[j]!]))
        if (ecart(a, b) < ECART_LISIBLE) {
          confondues.push(`${visibles[i]!}/${visibles[j]!}`)
        }
      }
    }
    expect(confondues).toEqual([PAIRE_CONFONDUE.join('/')])
  })

  it('l’écart GR/GRP est celui que l’issue rapporte', () => {
    const gr = deuteranope(enRvb(NETWORK_COLORS.GR))
    const grp = deuteranope(enRvb(NETWORK_COLORS.GRP))
    // 6,9 au relevé du 28/08. Une tolérance large : ce qui compte est
    // l'ordre de grandeur, et qu'il ne se dégrade pas en silence.
    expect(ecart(gr, grp)).toBeGreaterThan(5)
    expect(ecart(gr, grp)).toBeLessThan(9)
  })

  it('en vision normale, la même paire est confortable — c’est le piège', () => {
    const gr = enRvb(NETWORK_COLORS.GR)
    const grp = enRvb(NETWORK_COLORS.GRP)
    expect(ecart(gr, grp)).toBeGreaterThan(ECART_LISIBLE)
  })
})
