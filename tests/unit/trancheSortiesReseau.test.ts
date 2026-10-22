import { describe, it, expect } from 'vitest'
import {
  trancheSortiesReseau,
  SORTIES_RESEAU_AU_REPOS,
} from '../../src/store/trancheSortiesReseau.ts'
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
  enregistrement?: { points: { lon: number; lat: number }[] }
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

describe('SORTIES_RESEAU_AU_REPOS', () => {
  it('démarre vide, sans requête comptée', () => {
    // Trouvé par mutation du 17/10 : seul `appStore.ts` lisait cette
    // constante pour construire son état initial, et rien ne l'affirmait
    // directement.
    expect(SORTIES_RESEAU_AU_REPOS).toEqual({
      sortiesReseau: [],
      requetesAvecTrace: 0,
    })
  })
})

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

/*
  Issue #558, points 2 et 3 — le compteur « 0 requête contenait vos
  traces », annoncé comme mesuré, avait deux angles morts qu'il ne disait
  pas :
  - il comparait le **corps** de chaque requête, jamais l'**URL**. Or la
    seule voie par laquelle des coordonnées partent en clair est une URL
    GET — l'altimétrie, `lon=…&lat=…`. Preuve de la revue : un point de
    trace dans l'URL, corps `null`, donnait 0 ;
  - l'échantillon venait de `tracks` seules : la sortie en cours
    d'enregistrement n'était pas surveillée, alors qu'« À propos » promet
    qu'elle n'est envoyée à personne, « ni pendant, ni après ».
*/
describe('ce que le compteur regarde (issue #558)', () => {
  const point: [number, number] = [4.512345, 45.412345]

  it('un point de trace dans l’URL compte', () => {
    const { actions, lire } = harnais({ tracks: [trace([point, [4.6, 45.5]])] })
    actions.noterSortieReseau(
      'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4.512345|4.6&lat=45.412345|45.5',
      null,
    )
    expect(lire().requetesAvecTrace).toBe(1)
  })

  it('même encodé dans l’URL', () => {
    const { actions, lire } = harnais({ tracks: [trace([point, [4.6, 45.5]])] })
    actions.noterSortieReseau(
      'https://exemple.test/?lon=4.512345%7C4.6&lat=45.412345%7C45.5',
      null,
    )
    expect(lire().requetesAvecTrace).toBe(1)
  })

  it('une URL mal encodée ne fait pas tomber le compteur', () => {
    const { actions, lire } = harnais({ tracks: [trace([point, [4.6, 45.5]])] })
    actions.noterSortieReseau('https://exemple.test/?q=%E0%A4%A', null)
    expect(lire().sortiesReseau).toHaveLength(1)
    expect(lire().requetesAvecTrace).toBe(0)
  })

  it('un point de la sortie en cours d’enregistrement compte', () => {
    const { actions, lire } = harnais({
      enregistrement: {
        points: [
          { lon: point[0], lat: point[1] },
          { lon: 4.6, lat: 45.5 },
        ],
      },
    })
    actions.noterSortieReseau(
      'https://exemple.test/api',
      JSON.stringify({ position: [point[0], point[1]] }),
    )
    expect(lire().requetesAvecTrace).toBe(1)
  })
})

/*
  Revue du 20/10 : dans une URL d'altimétrie, les cent longitudes viennent
  d'un bloc et les cent latitudes d'un autre. Chercher la longitude d'un
  point et sa latitude séparément dans toute l'adresse ne vérifie pas
  qu'elles forment **un** point : quelqu'un qui a marché le GR et ouvre son
  profil pouvait voir crier à la fuite.
*/
describe('une URL lon=…&lat=… se lit par paires', () => {
  it('un point dont la longitude et la latitude sont dans deux paires différentes ne compte pas', () => {
    const { actions, lire } = harnais({
      tracks: [trace([[4.512345, 45.412345], [4.7, 45.7]])],
    })
    actions.noterSortieReseau(
      'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4.512345|4.6&lat=45.5|45.412345',
      null,
    )
    expect(lire().requetesAvecTrace).toBe(0)
  })

  it('la même paire, au même rang, compte', () => {
    const { actions, lire } = harnais({
      tracks: [trace([[4.512345, 45.412345], [4.7, 45.7]])],
    })
    actions.noterSortieReseau(
      'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4.6|4.512345&lat=45.5|45.412345',
      null,
    )
    expect(lire().requetesAvecTrace).toBe(1)
  })
})
