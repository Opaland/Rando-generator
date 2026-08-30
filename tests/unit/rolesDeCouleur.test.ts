import { describe, it, expect } from 'vitest'
import indexCss from '../../src/index.css?raw'
import { ENCRE, GRIS_VERT, PAPIER } from '../../src/lib/couleursPartagees.ts'
import {
  NETWORK_COLOR_VARS,
  NETWORK_COLORS,
} from '../../src/lib/networkDisplay.ts'

/**
 * Les rôles d'interface ne se servent plus dans les couleurs de carte (#361).
 *
 * ## Ce qui était confondu
 *
 * Trois jetons portaient deux rôles chacun :
 *
 * | jeton | rôle d'interface | rôle de carte |
 * |---|---|---|
 * | `--blanc-papier` | la surface | le fond de la carte |
 * | `--vert-noir` | l'encre | la couleur du réseau PERSO |
 * | `--gris-vert` | le texte secondaire | un repli de MapLibre |
 *
 * Tant qu'il n'y a qu'un thème clair, les deux valeurs coïncident et la
 * confusion ne coûte rien. Elle coûte au premier thème sombre : **le fond de
 * carte de l'IGN reste clair**, donc la carte garde ses couleurs pendant que
 * l'interface inverse les siennes. Un jeton ne peut pas suivre les deux.
 *
 * ## Ce que ce fichier garde
 *
 * Que les feuilles de style n'emploient plus les jetons de carte pour peindre
 * l'interface. Sans cette garde, le renommage se déferait à la première
 * déclaration écrite d'après ses voisines — et il se déferait **en silence**,
 * puisque les deux valeurs sont identiques aujourd'hui.
 *
 * Il garde aussi qu'elles le sont : ce lot ne devait déplacer aucune couleur,
 * et c'est la seule façon de le prouver autrement qu'en relisant.
 *
 * ## Ce qu'il ne garde pas, et pourquoi (#422)
 *
 * Une règle nommée d'après un réseau — `.PERSO`, `.GR`, `.INCONNU` — ne peint
 * pas l'interface : elle peint **le balisage**, et doit donc employer le
 * jeton de carte, comme `ProgressBalise.tsx` le fait déjà plus bas dans ce
 * fichier. Interdire `--vert-noir` partout aurait forcé le badge PERSO sur
 * `--encre`, c'est-à-dire à s'éclaircir en thème sombre pendant que la carte
 * continue de tracer le même trait sombre.
 *
 * L'interdiction saute donc ces règles-là, et seulement elles. La liste vient
 * de `NETWORK_COLOR_VARS` : une exception écrite à la main aurait été la
 * jumelle du §4ter, et se serait périmée au réseau suivant.
 *
 * C'est `tests/unit/badgesDeReseau.test.ts` qui prend le relais dans ce
 * périmètre — il exige la couleur exacte du réseau, pour chaque feuille de
 * badge. Un trou ici est donc couvert là, et pas laissé ouvert.
 */

const FEUILLES: Record<string, string> = import.meta.glob(
  '../../src/**/*.css',
  { query: '?raw', import: 'default', eager: true },
)

/** Les jetons de carte, et le rôle d'interface qui leur correspond. */
const ROLES: { carte: string; role: string; quoi: string }[] = [
  { carte: '--blanc-papier', role: '--papier', quoi: 'la surface' },
  {
    carte: '--vert-noir',
    role: '--encre pour l’interface, --encre-balisage sur un aplat de réseau',
    quoi: 'l’encre',
  },
  { carte: '--gris-vert', role: '--encre-douce', quoi: 'le texte secondaire' },
]

/**
 * La feuille privée de ses règles de balisage — celles dont le sélecteur est
 * un nom de réseau. C'est là, et là seulement, qu'un jeton de carte est à sa
 * place (#422).
 */
function horsBalisage(source: string): string {
  let reste = source
  for (const reseau of Object.keys(NETWORK_COLOR_VARS)) {
    reste = reste.replace(new RegExp(`^\\.${reseau}\\s*\\{[^}]*\\}`, 'gm'), '')
  }
  return reste
}

/**
 * Les couleurs de balisage qui ont un frère **lisible en tant que texte**.
 *
 * Trois aujourd'hui. Chacune est née du même constat : la couleur qui va
 * bien pour un trait sur la carte ne va pas pour du texte, et elle ne va
 * surtout pas pour du texte dans les deux thèmes.
 */
const LISIBLES = ['--jaune-pr', '--orange-grp', '--rouge-balisage'] as const

describe('une couleur de carte ne se lit pas en tant que texte (revue du 30/08)', () => {
  /*
    Trouvé en relisant le lot du 30/08, pas par un échec.

    Le volet 2 de #361 a nommé `--rouge-balisage-lisible` — quatrième jeton
    à double rôle, après les trois du volet 1 — parce que le rouge d'action
    tombait à 2,94:1 en thème sombre. Treize déclarations de texte l'ont
    suivi.

    Mais **la règle qui a produit ces trois frères n'existait qu'en prose**.
    Aucune des sept couleurs de réseau n'est employée comme texte
    aujourd'hui, c'est vérifié ; rien n'empêchait la huitième. Un
    `color: var(--bleu-local)` écrit demain passerait en silence, et ne
    serait attrapé que si `contraste-rendu.spec.ts` traversait justement
    l'état qui l'affiche — c'est-à-dire la fragilité même que #422 a coûtée.

    Une règle qu'on ne peut pas exécuter n'est pas une règle, c'est une
    bonne intention (§3).
  */
  it.each(Object.values(NETWORK_COLOR_VARS))(
    'aucune feuille ne pose du texte en %s',
    (jeton) => {
      const coupables: string[] = []
      for (const [chemin, source] of Object.entries(FEUILLES)) {
        /*
          `(^|[\\s;{])` et non `\\b` : `\\b` correspond **après un tiret**, donc
          `border-color:` et `accent-color:` entraient aussi. Onze feuilles
          sont ressorties coupables au premier passage, toutes innocentes —
          une assertion qui échoue pour une raison qu'on n'a pas voulue n'est
          pas une assertion (§1bis). Un trait ou une teinte de contrôle peut
          garder la couleur de balisage ; c'est le texte qui ne le peut pas.
        */
        if (new RegExp(`(^|[\\s;{])color:\\s*var\\(${jeton}\\)`, 'm').test(source)) {
          coupables.push(chemin)
        }
      }
      const frere = LISIBLES.includes(jeton as (typeof LISIBLES)[number])
        ? `\`${jeton}-lisible\``
        : `un frère \`${jeton}-lisible\`, à créer et à mesurer`
      expect(
        coupables,
        `Ces feuilles posent du texte en \`${jeton}\`, qui est une couleur de` +
          ` **balisage** : elle est choisie pour un trait sur la carte, pas` +
          ` pour être lue, et elle ne suit pas le thème. Employer ${frere}.`,
      ).toEqual([])
    },
  )

  /*
    Et le quatrième jeton reçoit la garde que les trois premiers avaient.

    `rolesDeCouleur.test.ts` prouvait déjà que le volet 1 n'avait déplacé
    aucune couleur en clair. J'ai affirmé la même chose du volet 2 dans sa
    PR — « en clair les deux valeurs coïncident » — **sans test derrière**,
    c'est-à-dire en relisant. Le §5 dit ce que vaut une affirmation de PR
    sans commande derrière elle.

    Cette garde ne vise que le rouge, et la première version de ce test a
    dû l'apprendre en rougissant : `--jaune-pr-lisible` vaut #8a6800 contre
    le #d9a400 du balisage, et `--orange-grp-lisible` diverge de même en
    gros texte. Ces écarts-là sont **voulus** — un jaune de balisage ne se
    lit pas sur du papier, et c'est tout l'objet de ces jetons. Le rouge est
    le seul dont le lot d'origine promettait qu'il ne déplaçait rien.
  */
  it('en clair, le rouge lisible vaut encore le rouge de balisage', () => {
    const clair = indexCss.slice(
      0,
      indexCss.indexOf('@media (prefers-color-scheme: dark)'),
    )
    const trouve = /--rouge-balisage-lisible:\s*(#[0-9a-f]{3,8})\s*;/i.exec(clair)
    expect(
      trouve?.[1]?.toLowerCase(),
      '`--rouge-balisage-lisible` doit valoir `--rouge-balisage` en thème' +
        " clair : le volet 2 de #361 ne devait déplacer aucune couleur là." +
        " S'il doit en déplacer une, c'est une décision à écrire (§2), pas" +
        ' un effet de bord.',
    ).toBe(NETWORK_COLORS.GR.toLowerCase())
  })
})

describe('les rôles d’interface ont leur propre nom (#361)', () => {
  it.each(ROLES)(
    'aucune feuille ne peint $quoi avec $carte',
    ({ carte, role, quoi }) => {
      const coupables: string[] = []
      for (const [chemin, source] of Object.entries(FEUILLES)) {
        // `var(--gris-vert-clair)` contient `--gris-vert` : c'est la
        // parenthèse fermante qui distingue les deux, et l'oublier ferait
        // rougir ce test sur un jeton qui n'a rien à voir.
        if (horsBalisage(source).includes(`var(${carte})`)) {
          coupables.push(chemin)
        }
      }
      expect(
        coupables,
        `Ces feuilles peignent ${quoi} avec \`${carte}\`, qui est une couleur` +
          ` de **carte**. Le fond de l'IGN reste clair quand l'interface passe` +
          ` en sombre : employer \`${role}\` (#361).`,
      ).toEqual([])
    },
  )

  /**
   * `ProgressBalise.tsx` garde `var(--vert-noir)`, et c'est voulu : là, c'est
   * la couleur du **réseau** PERSO, pas l'encre. La distinction est tout
   * l'objet de ce lot, et un test qui l'interdirait partout la manquerait.
   */
  it('la barre de progression garde la couleur du réseau, pas l’encre', () => {
    const composant = import.meta.glob(
      '../../src/components/ProgressBalise.tsx',
      { query: '?raw', import: 'default', eager: true },
    )['../../src/components/ProgressBalise.tsx'] as string
    expect(composant).toContain("PERSO: 'var(--vert-noir)'")
  })

  /**
   * Le renommage ne devait déplacer aucune couleur. En thème clair, les deux
   * jetons d'une même ligne valent donc la même chose — et le jour où ils
   * divergeront, ce sera dans un bloc `@media (prefers-color-scheme: dark)`,
   * pas ici.
   */
  it.each([
    ['--papier', PAPIER],
    ['--encre', ENCRE],
    ['--encre-douce', GRIS_VERT],
  ])('en clair, %s vaut la couleur qu’il remplaçait', (jeton, attendu) => {
    const trouve = new RegExp(`${jeton}:\\s*(#[0-9a-f]{3,8})\\s*;`, 'i').exec(
      indexCss,
    )
    expect(trouve?.[1]?.toLowerCase()).toBe(attendu.toLowerCase())
  })
})
