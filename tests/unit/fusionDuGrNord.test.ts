// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import grNord from '../fixtures/grNord/gr-nord.json' with { type: 'json' }
import {
  parseGrNordGeoJSON,
  GR_NORD_RELATION_ID_BASE,
} from '../../src/core/grNord.ts'
import type { DependancesZone } from '../../src/store/trancheZone.ts'
import type { Itinerary } from '../../src/core/types.ts'

/**
 * Le GR Nord fusionné dans la zone Nouvelle-Calédonie — même mécanisme que
 * les boucles de la Métropole de Lyon (`fusionDesBouclesLocales.test.ts`),
 * dont ce fichier reprend le harnais et le motif des cas : c'est la même
 * fonction, `fusionnerItinerairesSupplementaires`, appelée pour une seconde
 * source. Ce qui se vérifie ici et pas là-bas : que le GR Nord n'atterrit
 * que dans `nouvelle-caledonie`, jamais dans une zone qui porte les boucles
 * de Lyon ou l'inverse.
 */

const FETCHED_AT = '2026-09-16T00:00:00.000Z'
const ETAPES = parseGrNordGeoJSON(grNord, FETCHED_AT)

let asset: () => Promise<Response>

function harnais(zoneKey: string, itineraries: Itinerary[]) {
  const etat = { zoneKey, itineraries }
  const appels = { recompute: 0 }
  const deps = {
    set: (partiel: unknown) => {
      const bout =
        typeof partiel === 'function'
          ? (partiel as (e: unknown) => object)(etat)
          : partiel
      Object.assign(etat, bout)
    },
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: () => Promise.resolve(),
    recompute: () => {
      appels.recompute += 1
      return Promise.resolve()
    },
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone
  return { deps, etat, appels }
}

async function trancheFraiche(zoneKey: string, itineraries: Itinerary[]) {
  vi.resetModules()
  const { trancheZone } = await import('../../src/store/trancheZone.ts')
  const { deps, etat, appels } = harnais(zoneKey, itineraries)
  return { actions: trancheZone(deps), etat, appels }
}

const reponse = (corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

let requetes: string[] = []

beforeEach(() => {
  requetes = []
  asset = () => Promise.resolve(reponse(grNord))
  vi.stubGlobal('fetch', (url: unknown) => {
    requetes.push(String(url))
    return asset()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('le GR Nord ne s’invite que dans sa zone', () => {
  it('la Nouvelle-Calédonie les ajoute, et recalcule la complétion', async () => {
    const { actions, etat, appels } = await trancheFraiche(
      'nouvelle-caledonie',
      [],
    )
    await actions.mergeLocalBoucles('nouvelle-caledonie')
    expect(etat.itineraries).toHaveLength(ETAPES.length)
    expect(etat.itineraries.map((i) => i.osmRelationId)).toEqual(
      ETAPES.map((e) => e.osmRelationId),
    )
    expect(appels.recompute).toBe(1)
  })

  it('une zone qui n’est pas la Nouvelle-Calédonie ne va rien chercher', async () => {
    // 'vosges' plutôt que 'rhone' : celle-ci porte déjà les boucles de Lyon,
    // dont la requête polluerait l'assertion sur `requetes`.
    const { actions, etat } = await trancheFraiche('vosges', [])
    await actions.mergeLocalBoucles('vosges')
    expect(
      requetes,
      'l’asset du GR Nord était téléchargé pour une zone qu’il ne traverse pas.',
    ).toEqual([])
    expect(etat.itineraries).toEqual([])
  })

  it('ne fusionne rien si la zone a changé pendant le téléchargement', async () => {
    let livrer: (r: Response) => void = () => undefined
    asset = () =>
      new Promise<Response>((resolve) => {
        livrer = resolve
      })
    const { actions, etat, appels } = await trancheFraiche(
      'nouvelle-caledonie',
      [],
    )
    const fusion = actions.mergeLocalBoucles('nouvelle-caledonie')
    etat.zoneKey = 'rhone'
    livrer(reponse(grNord))
    await fusion
    expect(etat.itineraries).toEqual([])
    expect(appels.recompute).toBe(0)
  })

  it('ne les compte pas deux fois au retour sur la zone', async () => {
    const { actions, etat, appels } = await trancheFraiche(
      'nouvelle-caledonie',
      [...ETAPES],
    )
    await actions.mergeLocalBoucles('nouvelle-caledonie')
    expect(etat.itineraries).toHaveLength(ETAPES.length)
    expect(appels.recompute).toBe(0)
  })

  it('ses ids ne collisionnent pas avec les boucles de Lyon ni avec OSM', () => {
    for (const etape of ETAPES) {
      expect(etape.osmRelationId).toBeGreaterThanOrEqual(GR_NORD_RELATION_ID_BASE)
    }
  })
})
