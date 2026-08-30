import { describe, it, expect } from 'vitest'
import {
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../src/lib/networkDisplay.ts'
import { ORDRE_DES_RESEAUX } from '../../src/core/reseaux.ts'
import { POI_COLORS } from '../../src/lib/poiDisplay.ts'
import { TERRAIN_COLORS } from '../../src/lib/revetementDisplay.ts'
import {
  BLANC_BALISAGE,
  ENCRE,
  GRIS_VERT,
  PAPIER,
} from '../../src/lib/couleursPartagees.ts'

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

/* ---------- contraste, pour le badge et le fond ---------- */

function luminance(rgb: [number, number, number]): number {
  const [r, v, b] = rgb.map(canal) as [number, number, number]
  return 0.2126 * r + 0.7152 * v + 0.0722 * b
}
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(enRvb(a)), luminance(enRvb(b))].sort(
    (x, y) => y - x,
  ) as [number, number]
  return (clair + 0.05) / (sombre + 0.05)
}

/**
 * Toutes les couleurs que l'application **peint**, réunies une fois.
 *
 * Le commentaire de `INCONNU` disait « les vingt et une couleurs déjà
 * prises » — un compte relevé à la main en août, et qui a vieilli sans que
 * rien ne le dise : les points d'intérêt en ont gagné depuis. Le §4bis vaut
 * aussi pour un nombre. Ici la liste se construit depuis les tables
 * elles-mêmes, donc elle ne peut pas dériver.
 */
function couleursPeintes(sauf: string): string[] {
  const toutes = [
    ...Object.values(NETWORK_COLORS),
    ...Object.values(TERRAIN_COLORS).filter((c): c is string => c !== null),
    ...Object.values(POI_COLORS),
    PAPIER,
    ENCRE,
    GRIS_VERT,
    // `#fff` s'écrit en trois chiffres dans la palette ; `enRvb` en lit six.
    BLANC_BALISAGE.length === 4 ? '#ffffff' : BLANC_BALISAGE,
    POSITION_COLOR,
  ]
  return toutes.filter((c) => c.toLowerCase() !== sauf.toLowerCase())
}

/**
 * La couleur du réseau international, mesurée (#335).
 *
 * Le §2 range le choix d'une teinte du côté de ce qui se **décide** — elle
 * ne change rien à ce qui est calculé. Ce qui est mesurable, et donc gardé
 * ici, c'est qu'elle se distingue : de tout ce qui est peint, en vision
 * normale comme en vision deutéranope, et qu'elle porte du texte blanc.
 *
 * Les nombres sont ceux écrits dans `src/lib/networkDisplay.ts`. Les tenir
 * ici évite qu'ils vieillissent : une couleur ajoutée ailleurs dans la
 * palette fera rougir ce test, ce qu'aucune relecture ne ferait.
 */
describe('la couleur de l’itinéraire international (#335)', () => {
  const INTER = NETWORK_COLORS.INTERNATIONAL

  it('se distingue de tout ce que l’application peint', () => {
    const voisines = couleursPeintes(INTER)
      .map((c) => [c, ecart(enRvb(INTER), enRvb(c))] as const)
      .sort((a, b) => a[1] - b[1])
    const [plusProche, distance] = voisines[0] as readonly [string, number]
    expect(
      distance,
      `${INTER} est à ΔE ${distance.toFixed(1)} de ${plusProche}, sous le` +
        ` repère de ${String(ECART_LISIBLE)} : les deux se confondent sur la carte.`,
    ).toBeGreaterThanOrEqual(ECART_LISIBLE)
    // 26,2 au relevé du 30/08, contre le bleu des points d'eau. La borne
    // haute dit que la mesure est bien celle qu'on croit : un écart devenu
    // énorme signalerait qu'on ne compare plus les mêmes couleurs.
    expect(distance).toBeLessThan(40)
  })

  it('reste séparable pour un deutéranope, et largement', () => {
    /*
      C'est ce qui a écarté le vert (#00833f, ΔE deutéranope 25,3) et le rose
      (#cb3b63, 27,0) au profit du bleu. #360 dit que la paire GR/GRP
      s'effondre déjà pour un homme sur douze : ajouter une couleur qui ne
      tient que de justesse aurait été empiler sur un défaut ouvert.
    */
    const inter = deuteranope(enRvb(INTER))
    const autres = ORDRE_DES_RESEAUX.filter(
      (r) => r !== 'PERSO' && r !== 'INTERNATIONAL',
    )
    const distances = autres.map((r) =>
      ecart(inter, deuteranope(enRvb(NETWORK_COLORS[r]))),
    )
    expect(Math.min(...distances)).toBeGreaterThan(40)
  })

  it('porte du texte blanc, et se pose sur le papier', () => {
    // WCAG 1.4.3 niveau AA, 4,5:1 — un seuil emprunté, pas inventé (§6sexies).
    expect(contraste('#ffffff', INTER)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(INTER, PAPIER)).toBeGreaterThanOrEqual(4.5)
  })
})
