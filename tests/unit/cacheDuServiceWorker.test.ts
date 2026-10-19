import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'
import telechargementSource from '../../src/core/telechargement.ts?raw'

/**
 * La règle « qu'est-ce qu'une tuile, qu'est-ce qu'un profil » vit deux fois
 * (revue globale du 19/10, CLAUDE.md §4ter).
 *
 * `public/sw.js` est servi tel quel et n'importe rien de `src` : il a ses
 * propres `estTuile` et `estAltimetrie`. `src/core/telechargement.ts` en a
 * les jumelles `estTuileCarte` et `estAltimetrie`, que l'application
 * n'appelle nulle part — leurs tests éprouvaient donc la copie qui ne tourne
 * pas. Un hôte ajouté d'un seul côté aurait laissé ces tests verts et le
 * cache faux.
 *
 * Les deux corps doivent être le même texte, aux espaces près.
 */
function corps(source: string, nom: string): string {
  const debut = new RegExp(`function ${nom}\\(url(?:: URL)?\\)(?:: boolean)? \\{`).exec(source)
  if (!debut) throw new Error(`${nom} introuvable`)
  const depuis = debut.index + debut[0].length
  const fin = source.indexOf('\n}', depuis)
  return source.slice(depuis, fin).replace(/\s+/g, ' ').trim()
}

describe('la règle de cache, des deux côtés', () => {
  it.each([
    ['estTuile', 'estTuileCarte'],
    ['estAltimetrie', 'estAltimetrie'],
  ])('%s du service worker et %s du cœur disent la même chose', (cote, coeur) => {
    expect(corps(telechargementSource, coeur)).toBe(corps(swSource, cote))
  })
})
