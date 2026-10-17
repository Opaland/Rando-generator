// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport, type EtatImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * L'avancement affiché pendant un import de plusieurs fichiers.
 *
 * Trouvé par la vague de mutation du 17/10 : aucun test ne lit
 * `importProgress` **pendant** un import — seulement avant (`null`) et
 * après (`null` de nouveau, remis par `deposerLeResultatDeLImport`). Les
 * valeurs intermédiaires, pourtant posées une fois par fichier, n'étaient
 * jamais vérifiées.
 *
 * `deps.set` est ici intercepté pour en garder un relevé, sans toucher au
 * harnais partagé.
 */
function espionnerLAvancement() {
  const { deps, etat } = espionner()
  const progressions: (EtatImport['importProgress'] | undefined)[] = []
  const poserOriginal = deps.set
  return {
    deps: {
      ...deps,
      set: (partiel: Parameters<typeof deps.set>[0]) => {
        const suite =
          typeof partiel === 'function' ? partiel(etat()) : partiel
        if ('importProgress' in suite) progressions.push(suite.importProgress)
        poserOriginal(partiel)
      },
    },
    etat,
    progressions,
  }
}

describe('importGpxFiles annonce chaque fichier au fil de l’import', () => {
  it('pose le nom, le rang et le total de chaque fichier', async () => {
    const { deps, progressions } = espionnerLAvancement()

    await trancheImport(deps).importGpxFiles([
      new File(['x'], 'premier.gpx'),
      new File(['x'], 'second.gpx'),
    ])

    // Les deux progressions posées par la boucle principale (pas celle, à
    // part, de `developperArchives`, qui ne parle qu'aux archives zip).
    const duFichier = progressions.filter(
      (p): p is NonNullable<typeof p> => p !== null && p !== undefined,
    )
    expect(duFichier).toEqual([
      { done: 0, total: 2, filename: 'premier.gpx' },
      { done: 1, total: 2, filename: 'second.gpx' },
    ])
  })
})

describe('importCustomGpx annonce chaque fichier au fil de l’import', () => {
  // Même boucle, même lacune, dans l'autre action d'import.
  it('pose le nom, le rang et le total de chaque fichier', async () => {
    const { deps, progressions } = espionnerLAvancement()

    await trancheImport(deps).importCustomGpx([
      new File(['x'], 'premier.geojson'),
      new File(['x'], 'second.geojson'),
    ])

    const duFichier = progressions.filter(
      (p): p is NonNullable<typeof p> => p !== null && p !== undefined,
    )
    expect(duFichier).toEqual([
      { done: 0, total: 2, filename: 'premier.geojson' },
      { done: 1, total: 2, filename: 'second.geojson' },
    ])
  })
})
