import { describe, it, expect } from 'vitest'
import {
  OBJECTIFS_AU_REPOS,
  lireObjectifs,
  trancheObjectifs,
  type EtatObjectifs,
} from '../../src/store/trancheObjectifs.ts'
import type { Itinerary, Sample } from '../../src/core/types.ts'
import type { MatchResult } from '../../src/core/matching.ts'

/**
 * Les objectifs épinglés (issue #13), sortis du store le 30/09.
 *
 * Ces tests gardent ce qu'un test de bout en bout tient mal : la forme
 * écrite (du JSON, jamais un tableau brut — le magasin des réglages ne
 * connaît que des nombres et des chaînes), et l'ordre (on écrit avant
 * d'appliquer, comme pour les réglages d'écran, §203).
 */

const GR7: Itinerary = {
  osmRelationId: 1,
  ref: 'GR 7',
  name: null,
  network: 'GR',
  ways: [{ osmWayId: 10, coords: [[4.5, 45.4], [4.6, 45.4]] }],
  totalMeters: 8_000,
  fetchedAt: '2026-08-20T00:00:00Z',
}

function echantillons(motif: boolean[], wayId = 10): Sample[] {
  return motif.map((done, i) => ({
    lon: 4.5 + i * 0.01,
    lat: 45.4,
    wayId,
    itineraryIds: [1],
    done,
  }))
}

function matchResult(samples: Sample[]): MatchResult {
  return {
    samples,
    results: [],
    global: { doneMeters: 0, totalMeters: 0, pct: 0 },
    byNetwork: {
      GR: { doneMeters: 0, totalMeters: 0, pct: 0 },
      GRP: { doneMeters: 0, totalMeters: 0, pct: 0 },
      PR: { doneMeters: 0, totalMeters: 0, pct: 0 },
      INTERNATIONAL: { doneMeters: 0, totalMeters: 0, pct: 0 },
      LOCAL: { doneMeters: 0, totalMeters: 0, pct: 0 },
      PERSO: { doneMeters: 0, totalMeters: 0, pct: 0 },
      INCONNU: { doneMeters: 0, totalMeters: 0, pct: 0 },
    },
  }
}

function banc({
  objectifs = [],
  matching = null,
  itineraries = [],
  customItineraries = [],
}: {
  objectifs?: number[]
  matching?: MatchResult | null
  itineraries?: Itinerary[]
  customItineraries?: Itinerary[]
} = {}) {
  const journal: string[] = []
  const ecrits: { clef: string; valeur: string }[] = []
  let etat: EtatObjectifs = { objectifs }

  const actions = trancheObjectifs({
    lire: () => ({ objectifs: etat.objectifs, matching, itineraries, customItineraries }),
    set: (partiel) => {
      journal.push('appliquer')
      etat = { ...etat, ...partiel }
    },
    enregistrerReglage: (clef, valeur, appliquer) => {
      journal.push(`ecrire:${clef}=${valeur}`)
      ecrits.push({ clef, valeur })
      appliquer()
      return Promise.resolve()
    },
  })
  return { actions, journal, ecrits, etat: () => etat }
}

describe('au départ', () => {
  it('aucun objectif épinglé', () => {
    expect(OBJECTIFS_AU_REPOS).toEqual({ objectifs: [] })
  })
})

describe('basculerObjectif', () => {
  it('épingle un itinéraire absent de la liste', async () => {
    const b = banc({ objectifs: [] })
    await b.actions.basculerObjectif(42)
    expect(b.ecrits).toEqual([{ clef: 'objectifs', valeur: '[42]' }])
    expect(b.etat().objectifs).toEqual([42])
  })

  it('dépingle un itinéraire déjà présent', async () => {
    const b = banc({ objectifs: [42, 7] })
    await b.actions.basculerObjectif(42)
    expect(b.ecrits).toEqual([{ clef: 'objectifs', valeur: '[7]' }])
    expect(b.etat().objectifs).toEqual([7])
  })

  it('écrit en JSON, jamais un tableau brut', async () => {
    // Le magasin des réglages ne connaît que des nombres et des chaînes.
    const b = banc()
    await b.actions.basculerObjectif(1)
    expect(typeof b.ecrits[0]?.valeur).toBe('string')
    expect(JSON.parse(b.ecrits[0]?.valeur ?? '')).toEqual([1])
  })

  it('écrit avant d’appliquer', async () => {
    const b = banc()
    await b.actions.basculerObjectif(1)
    expect(b.journal.indexOf('ecrire:objectifs=[1]')).toBeLessThan(
      b.journal.indexOf('appliquer'),
    )
  })
})

describe('resumeDeLObjectif', () => {
  it('rend null sans matching', () => {
    const b = banc({ itineraries: [GR7] })
    expect(b.actions.resumeDeLObjectif(1)).toBeNull()
  })

  it('rend null pour un itinéraire inconnu', () => {
    const b = banc({ matching: matchResult(echantillons([true])) })
    expect(b.actions.resumeDeLObjectif(999)).toBeNull()
  })

  it('cherche aussi dans les itinéraires personnels', () => {
    const perso: Itinerary = { ...GR7, osmRelationId: -1, network: 'PERSO' }
    const b = banc({
      customItineraries: [perso],
      matching: matchResult(echantillons([true, false, false])),
    })
    expect(b.actions.resumeDeLObjectif(-1)).not.toBeNull()
  })

  it('rend ce qu’il reste à marcher, calculé depuis les échantillons', () => {
    const b = banc({
      itineraries: [GR7],
      matching: matchResult(echantillons([true, false, false, true])),
    })
    const resume = b.actions.resumeDeLObjectif(1)
    expect(resume).not.toBeNull()
    expect(resume?.troncons.length).toBeGreaterThan(0)
  })
})

describe('lireObjectifs', () => {
  it('relit un tableau JSON valide', () => {
    expect(lireObjectifs('[42,7]')).toEqual([42, 7])
  })

  it('ignore ce qui n’est pas un tableau de nombres', () => {
    expect(lireObjectifs('["a","b"]')).toEqual([])
  })

  it('ne casse pas sur du JSON invalide', () => {
    expect(lireObjectifs('{not json')).toEqual([])
  })

  it('rend une liste vide quand rien n’a été écrit', () => {
    expect(lireObjectifs(undefined)).toEqual([])
  })

  it('rend une liste vide pour une valeur qui n’est pas une chaîne', () => {
    expect(lireObjectifs(42)).toEqual([])
  })
})
