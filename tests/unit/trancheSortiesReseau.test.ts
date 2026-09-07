import { describe, it, expect } from 'vitest'
import { trancheSortiesReseau } from '../../src/store/trancheSortiesReseau.ts'
import type { EntreeJournal } from '../../src/core/journalSortant.ts'
import type { Track } from '../../src/core/types.ts'

/**
 * Issue #445 — `noterSortieReseau`, sorti d'`appStore.ts` sans test dédié
 * jusqu'ici (seule la porte e2e le couvrait). Ce fichier prouve que le
 * découpage n'a rien changé au comportement, avant d'aller chercher plus
 * loin.
 */

interface EtatDeTest {
  tracks: Track[]
  sortiesReseau: EntreeJournal[]
  requetesAvecTrace: number
}

function harnais(initial: Partial<EtatDeTest> = {}) {
  let etat: EtatDeTest = {
    tracks: [],
    sortiesReseau: [],
    requetesAvecTrace: 0,
    ...initial,
  }
  const set = (
    partiel:
      | Partial<EtatDeTest>
      | ((e: EtatDeTest) => Partial<EtatDeTest>),
  ) => {
    const patch = typeof partiel === 'function' ? partiel(etat) : partiel
    etat = { ...etat, ...patch }
  }
  const actions = trancheSortiesReseau({ set })
  return { actions, lire: () => etat }
}

function trace(points: Track['points']): Track {
  return {
    id: 't1',
    filename: 't1.gpx',
    points,
    date: null,
    importedAt: '2026-01-01T00:00:00Z',
  }
}

describe('trancheSortiesReseau', () => {
  it('journalise une requête ordinaire sans la compter comme une fuite', () => {
    const { actions, lire } = harnais()
    actions.noterSortieReseau('https://data.geopf.fr/tile/1', null)
    expect(lire().sortiesReseau).toHaveLength(1)
    expect(lire().requetesAvecTrace).toBe(0)
  })

  it('compte une requête dont le corps porte un point d’une trace connue', () => {
    const { actions, lire } = harnais({
      tracks: [
        trace([
          [4.512345, 45.412345],
          [4.6, 45.5],
        ]),
      ],
    })
    actions.noterSortieReseau(
      '/__sonde',
      JSON.stringify({ points: [[4.512345, 45.412345]] }),
    )
    expect(lire().requetesAvecTrace).toBe(1)
  })

  it('ne compte pas une requête dont le corps ne porte aucun point connu', () => {
    const { actions, lire } = harnais({
      tracks: [trace([[4.512345, 45.412345]])],
    })
    actions.noterSortieReseau('/x', JSON.stringify({ points: [[1, 1]] }))
    expect(lire().requetesAvecTrace).toBe(0)
  })

  it('cumule le compteur au fil des requêtes plutôt que de le remplacer', () => {
    const { actions, lire } = harnais({
      tracks: [trace([[4.512345, 45.412345]])],
    })
    const corps = JSON.stringify({ points: [[4.512345, 45.412345]] })
    actions.noterSortieReseau('/a', corps)
    actions.noterSortieReseau('/b', corps)
    expect(lire().requetesAvecTrace).toBe(2)
    // Même destination (fichiers du site) : `noterSortie` fusionne les deux
    // requêtes en une entrée dont le compte monte à 2, plutôt que d'empiler
    // deux entrées — voir `core/journalSortant.ts`.
    expect(lire().sortiesReseau).toHaveLength(1)
    expect(lire().sortiesReseau[0]?.nombre).toBe(2)
  })
})
