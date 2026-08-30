import { describe, it, expect } from 'vitest'
import indexCss from '../../src/index.css?raw'
import {
  NETWORK_COLOR_VARS,
  NETWORK_COLORS,
  POSITION_COLOR,
} from '../../src/lib/networkDisplay.ts'
import {
  BLANC_BALISAGE,
  ENCRE,
  GRIS_VERT,
  PAPIER,
} from '../../src/lib/couleursPartagees.ts'
import { TERRAIN_COLORS } from '../../src/lib/revetementDisplay.ts'
import type { Network } from '../../src/core/types.ts'

/**
 * Les couleurs de balisage existent forcément en deux endroits : MapLibre ne
 * lit pas les propriétés personnalisées CSS, et les badges de la barre
 * latérale ne peuvent pas lire une constante JavaScript depuis une feuille
 * de style. Ce test empêche les deux listes de diverger en silence — un
 * décalage entre la couleur d'un badge et celle du tracé sur la carte ne se
 * voit qu'au moment où l'on compare, c'est-à-dire jamais.
 */
const VARIABLES = NETWORK_COLOR_VARS

describe('couleurs de réseau', () => {
  it('couvre tous les réseaux', () => {
    expect(Object.keys(VARIABLES).sort()).toEqual(
      Object.keys(NETWORK_COLORS).sort(),
    )
  })

  it.each(Object.entries(VARIABLES))(
    'la constante %s vaut la variable CSS %s',
    (network, variable) => {
      const attendu = NETWORK_COLORS[network as Network].toLowerCase()
      const trouve = new RegExp(`${variable}:\\s*([^;]+);`).exec(indexCss)
      expect(trouve?.[1]?.trim().toLowerCase()).toBe(attendu)
    },
  )
})

describe('couleur de position', () => {
  it('le point sur la carte et le bouton « où suis-je » sont du même bleu', () => {
    // MapLibre peint le point, le CSS peint le bouton : ni l'un ni l'autre ne
    // peut lire la valeur de l'autre. Un décalage entre les deux ne se
    // remarquerait qu'en les regardant côte à côte, c'est-à-dire jamais.
    const trouve = /--bleu-position:\s*([^;]+);/.exec(indexCss)
    expect(trouve?.[1]?.trim().toLowerCase()).toBe(POSITION_COLOR.toLowerCase())
  })
})

/**
 * Les couleurs de base, ajoutées le 23/08.
 *
 * Elles traînaient recopiées à la main : six `#1e2b23`, trois `#faf7f2`,
 * trois `#ffffff` dans `map/style.ts` et `summaryCard.ts`. La duplication
 * JS/CSS est inévitable — `DESIGN_SYSTEM.md` explique pourquoi — mais la
 * recopie **à l'intérieur du monde JS** ne l'était pas, et c'est elle qui
 * laissait un `#c1272d` orphelin s'installer sans que rien ne le signale.
 */
const BASES: Record<string, string> = {
  '--blanc-papier': PAPIER,
  '--vert-noir': ENCRE,
  '--gris-vert': GRIS_VERT,
  '--blanc-balisage': BLANC_BALISAGE,
}

describe('couleurs de base', () => {
  it.each(Object.entries(BASES))(
    'la variable CSS %s vaut la constante partagée',
    (variable, attendu) => {
      const trouve = new RegExp(`${variable}:\\s*([^;]+);`).exec(indexCss)
      expect(trouve?.[1]?.trim().toLowerCase()).toBe(attendu.toLowerCase())
    },
  )
})

/**
 * Le terrain, peint des deux côtés (24/08).
 *
 * La carte le dessine par MapLibre, depuis la constante JavaScript ; le
 * profil altimétrique le dessine en CSS, depuis les jetons. Deux surfaces
 * qui parlent du même sol ne peuvent pas en parler de deux façons — et rien
 * ne le remarquerait, puisqu'on ne les regarde jamais côte à côte.
 */
const TERRAIN: Record<string, string> = {
  '--terrain-dur': TERRAIN_COLORS.dur as string,
  '--terrain-stabilise': TERRAIN_COLORS.stabilise as string,
  '--terrain-naturel': TERRAIN_COLORS.naturel as string,
  '--terrain-autre': TERRAIN_COLORS.autre as string,
}

describe('couleurs du terrain', () => {
  it.each(Object.entries(TERRAIN))(
    'la variable CSS %s vaut la constante partagée',
    (variable, attendu) => {
      const trouve = new RegExp(`${variable}:\\s*([^;]+);`).exec(indexCss)
      expect(trouve?.[1]?.trim().toLowerCase()).toBe(attendu.toLowerCase())
    },
  )
})

/**
 * Les couples texte / fond déclarés, dans les deux modes de taille.
 *
 * `tests/e2e/contraste-rendu.spec.ts` mesure ce que l'écran rend vraiment, et
 * c'est la mesure qui compte. Mais il ne voit que les états qu'il traverse :
 * les étoiles de qualité d'une trace demandent une trace importée et notée,
 * qu'aucun de ses parcours ne produit. Elles étaient à **2,12:1** depuis le
 * début.
 *
 * Ce test-ci travaille sur la palette et non sur l'écran. Il ne remplace pas
 * l'autre — il couvre ce que l'autre n'atteint pas, et il coûte trois
 * millisecondes.
 *
 * Le seuil est emprunté, pas inventé : **WCAG 1.4.3 niveau AA**, 4,5:1 pour
 * un texte courant (CLAUDE.md §6sexies).
 */
function luminance(hex: string): number {
  // `#fff` est une écriture aussi légitime que `#ffffff`, et la palette
  // emploie les deux. La première version ne lisait que la seconde : le
  // couple du badge GR rendait `NaN`, et `NaN >= 4.5` est faux — le test
  // rougissait pour la bonne raison, mais en disant la mauvaise.
  const court = hex.replace('#', '')
  const n =
    court.length === 3
      ? court
          .split('')
          .map((c) => c + c)
          .join('')
      : court
  const canaux = [0, 2, 4].map(
    (i) => Number.parseInt(n.slice(i, i + 2), 16) / 255,
  )
  const lineaire = canaux.map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return (
    0.2126 * (lineaire[0] as number) +
    0.7152 * (lineaire[1] as number) +
    0.0722 * (lineaire[2] as number)
  )
}

function contraste(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Lit un jeton dans `index.css`, au choix dans la déclaration de base ou
 * dans celle du gros texte.
 *
 * La distinction n'est pas décorative : le gros texte **redéfinit** quatre
 * couleurs, et un test qui ne lirait que la première déclaration affirmerait
 * couvrir un mode qu'il ne regarde jamais. C'est ainsi que le badge « PR »
 * est resté sous le seuil sans que rien ne le dise.
 */
type Taille = 'normal' | 'gros'
type Lumiere = 'clair' | 'sombre'

/** Le bloc `@media (prefers-color-scheme: dark)`, entier. */
const BLOC_SOMBRE =
  /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}\n/.exec(
    indexCss,
  )?.[1] ?? ''

/**
 * Les déclarations à consulter, **de la plus spécifique à la plus générale**.
 *
 * C'est l'ordre du navigateur, pas un ordre de commodité : sous
 * `prefers-color-scheme: dark` avec le gros texte, quatre déclarations de
 * `--encre-douce` existent, et c'est celle du bloc sombre + gros texte qui
 * gagne. Un test qui lirait la première trouvée affirmerait couvrir un mode
 * qu'il ne regarde jamais — c'est ainsi que le badge « PR » est resté sous
 * le seuil (#343), et le §6quinquies dit que le mode oublié est celui qui
 * mord.
 */
function declarations(taille: Taille, lumiere: Lumiere): string[] {
  const grosClair =
    /:root\[data-gros-texte='oui'\]\s*\{([\s\S]*?)\n\}/.exec(
      indexCss,
    )?.[1] ?? ''
  const grosSombre =
    /:root\[data-gros-texte="oui"\]\s*\{([\s\S]*?)\n {2}\}/.exec(
      BLOC_SOMBRE,
    )?.[1] ?? ''
  const racineSombre =
    /:root\s*\{([\s\S]*?)\n {2}\}/.exec(BLOC_SOMBRE)?.[1] ?? ''
  const blocs: string[] = []
  if (taille === 'gros' && lumiere === 'sombre') blocs.push(grosSombre)
  if (lumiere === 'sombre') blocs.push(racineSombre)
  if (taille === 'gros') blocs.push(grosClair)
  blocs.push(indexCss)
  return blocs
}

function jeton(nom: string, taille: Taille, lumiere: Lumiere): string {
  for (const bloc of declarations(taille, lumiere)) {
    const trouve = new RegExp(`${nom}:\\s*(#[0-9a-f]{3,8})\\s*;`, 'i').exec(
      bloc,
    )
    if (trouve?.[1]) return trouve[1]
  }
  throw new Error(`jeton ${nom} introuvable`)
}

/**
 * Chaque couple est écrit avec **l'endroit où il se voit** : sans cela, un
 * échec dit qu'un ratio est trop bas sans dire où regarder.
 */
const COUPLES: { ou: string; texte: string; fond: string }[] = [
  /*
    Les jetons de **rôle** et non ceux de carte, depuis #361 : ces couples
    disent ce qui se lit dans l'interface, et l'interface est ce qui changera
    de fond au premier thème sombre. Les employer ici, c'est faire mesurer à
    ce test le mode qu'on aura, pas seulement celui qu'on a.
  */
  {
    ou: 'badge PR (liste, fiche)',
    texte: '--encre-balisage',
    fond: '--jaune-pr',
  },
  { ou: 'badge GR', texte: '--blanc-balisage', fond: '--rouge-balisage' },
  { ou: 'badge GRP', texte: '--blanc-balisage', fond: '--orange-grp' },
  {
    ou: 'badge Boucle locale',
    texte: '--blanc-balisage',
    fond: '--bleu-local',
  },
  {
    ou: 'étoiles de qualité',
    texte: '--jaune-pr-lisible',
    fond: '--papier',
  },
  {
    ou: 'écart de progression',
    texte: '--orange-grp-lisible',
    fond: '--papier',
  },
  { ou: 'texte courant', texte: '--encre', fond: '--papier' },
  { ou: 'texte secondaire', texte: '--encre-douce', fond: '--papier' },
]

describe('les couples texte / fond tiennent WCAG 1.4.3 AA', () => {
  /*
    Quatre modes et non deux depuis #361. Le thème sombre ne se contente pas
    d'inverser : les valeurs du gros texte **assombrissent** pour renforcer le
    contraste sur du papier, ce qui va dans le mauvais sens sur fond sombre.
    Le mode « sombre + gros texte » est celui qu'on oublie, et c'est celui où
    le texte secondaire tomberait à 2,5:1.
  */
  for (const lumiere of ['clair', 'sombre'] as const) {
    for (const taille of ['normal', 'gros'] as const) {
      it.each(COUPLES)(
        `en ${lumiere}, taille ${taille === 'gros' ? 'agrandie' : 'normale'} : $ou`,
        ({ ou, texte, fond }) => {
          const ct = jeton(texte, taille, lumiere)
          const cf = jeton(fond, taille, lumiere)
          const mesure = contraste(ct, cf)
          expect(
            Math.round(mesure * 100) / 100,
            `${ou} en ${lumiere} : ${ct} sur ${cf}`,
          ).toBeGreaterThanOrEqual(4.5)
        },
      )
    }
  }

  /**
   * La garde ne vaut que si elle sait dire non. On lui présente le couple
   * exact qui a échoué — l'ancien jaune assombri sous un texte sombre — sans
   * toucher à la palette.
   */
  it('refuse le couple qui a échoué', () => {
    expect(contraste('#1e2b23', '#8a6800')).toBeLessThan(4.5)
    expect(contraste('#d9a400', '#faf7f2')).toBeLessThan(4.5)
  })
})
