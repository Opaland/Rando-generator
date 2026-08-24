import { describe, it, expect } from 'vitest'

/**
 * Ce que Sentiers lit d'OpenStreetMap est une **déclaration**, pas un état.
 *
 * `opening_hours` est ce qu'un contributeur a saisi un jour, et rien ne dit
 * quand. En montagne, la fermeture saisonnière est la règle et n'y figure
 * presque jamais : la supérette d'un village de 400 habitants qui annonce
 * « Mo-Sa 08:00-19:00 » est fermée de novembre à mai.
 *
 * L'application écrivait « ouvert Mo-Sa 08:00-19:00 ». Le mot affirmait
 * l'état du monde là où la donnée ne porte qu'une annonce, et le prix de
 * l'erreur se paie sur le terrain : on arrive avec un sac vide.
 *
 * Cette garde est statique, et c'est voulu. Un test de rendu n'attraperait
 * la formule qu'aux endroits où il pense à regarder ; le défaut, lui, se
 * recopie ailleurs — la prochaine surface qui affichera un horaire, un
 * gardiennage ou une ouverture de refuge. On cherche donc la **formule**,
 * dans toutes les sources, et pas un fichier (CLAUDE.md §3).
 */

const sources: Record<string, string> = {
  ...import.meta.glob<string>('../../src/**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>('../../src/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

/**
 * Les commentaires sont retirés avant examen : celui qui explique la règle
 * cite forcément la formule interdite, et se dénoncerait lui-même.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Les mots qui affirment un état, suivis immédiatement d'une donnée OSM.
 *
 * `ouvert ${...}` est la formule fautive ; `annoncé ouvert ${...}` ne l'est
 * pas, parce que le premier mot rend la phrase à celui qui la tient. La
 * lettre initiale majuscule ou minuscule est acceptée des deux côtés.
 */
const AFFIRMATIONS = /(?<!annoncé\s)\b(ouvert|fermé|gardé)e?s?\s+\$\{/gi

describe('un horaire déclaré ne s’affiche pas comme un état', () => {
  for (const [chemin, brut] of Object.entries(sources)) {
    it(`${chemin.replace('../../', '')} n’affirme pas une ouverture`, () => {
      const trouvees = [...sansCommentaires(brut).matchAll(AFFIRMATIONS)].map(
        (m) => m[0],
      )
      expect(
        trouvees,
        'une donnée OSM annoncée est présentée comme un fait constaté',
      ).toEqual([])
    })
  }
})
