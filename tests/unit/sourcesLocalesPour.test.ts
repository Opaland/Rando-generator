import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchLocalBoucles,
  sourcesLocalesPour,
} from '../../src/store/sourcesLocales.ts'

/**
 * Quelle zone reçoit quelle source embarquée.
 *
 * Écrit après la vague de mutation du 18/10 : la zone « trois » (« Rhône,
 * Loire et Pilat », `core/overpass.ts`) pouvait perdre les boucles de
 * Lyon sans qu'aucun test le voie, et l'adresse du GR Nord pouvait devenir
 * vide. Rien n'appelait `sourcesLocalesPour` directement.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sourcesLocalesPour', () => {
  it.each(['rhone', 'trois'])('donne les boucles de Lyon à « %s »', (zone) => {
    expect(sourcesLocalesPour(zone)).toEqual([fetchLocalBoucles])
  })

  it('ne donne rien à une zone qu’aucune source ne couvre', () => {
    expect(sourcesLocalesPour('pilat')).toEqual([])
  })

  it('va chercher le GR Nord à son adresse, pour la Nouvelle-Calédonie', async () => {
    const demandes: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        demandes.push(url)
        return Promise.resolve(new Response('', { status: 404 }))
      }),
    )
    const [source, ...autres] = sourcesLocalesPour('nouvelle-caledonie')
    expect(autres).toEqual([])
    await source?.()
    expect(demandes).toHaveLength(1)
    expect(demandes[0]?.endsWith('data/gr-nord-province-nord.json')).toBe(true)
  })
})

/*
  Survivant équivalent (§6bis) : dans `memoriserJson`, `.catch(() => null)`
  remplacé par `.catch(() => undefined)` — chaque analyseur traite les deux
  comme une donnée illisible, et rend le même résultat vide.
*/
