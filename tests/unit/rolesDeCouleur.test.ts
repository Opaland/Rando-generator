import { describe, it, expect } from 'vitest'
import indexCss from '../../src/index.css?raw'
import {
  ENCRE,
  GRIS_VERT,
  PAPIER,
} from '../../src/lib/couleursPartagees.ts'

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
 */

const FEUILLES: Record<string, string> = import.meta.glob(
  '../../src/**/*.css',
  { query: '?raw', import: 'default', eager: true },
)

/** Les jetons de carte, et le rôle d'interface qui leur correspond. */
const ROLES: { carte: string; role: string; quoi: string }[] = [
  { carte: '--blanc-papier', role: '--papier', quoi: 'la surface' },
  { carte: '--vert-noir', role: '--encre', quoi: 'l’encre' },
  { carte: '--gris-vert', role: '--encre-douce', quoi: 'le texte secondaire' },
]

describe('les rôles d’interface ont leur propre nom (#361)', () => {
  it.each(ROLES)(
    'aucune feuille ne peint $quoi avec $carte',
    ({ carte, role, quoi }) => {
      const coupables: string[] = []
      for (const [chemin, source] of Object.entries(FEUILLES)) {
        // `var(--gris-vert-clair)` contient `--gris-vert` : c'est la
        // parenthèse fermante qui distingue les deux, et l'oublier ferait
        // rougir ce test sur un jeton qui n'a rien à voir.
        if (source.includes(`var(${carte})`)) coupables.push(chemin)
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
