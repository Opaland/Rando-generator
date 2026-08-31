// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import metropole from '../fixtures/boucles/metropole.json' with { type: 'json' }
import {
  parseBouclesGeoJSON,
  LOCAL_RELATION_ID_BASE,
} from '../../src/core/boucles.ts'
import type { DependancesZone } from '../../src/store/trancheZone.ts'
import type { Itinerary } from '../../src/core/types.ts'

/**
 * Les boucles locales fusionnées dans la zone affichée.
 *
 * ## D'où vient ce fichier
 *
 * `mergeLocalBoucles` était le dernier bloc de `trancheZone.ts` que la vague
 * du 30/08 montrait **sans un seul mutant couvert** : quatorze, sur cinq
 * lignes. Elle passe par les tests de bout en bout, que la mutation ne lance
 * pas.
 *
 * ## Les deux survivants qui changent un résultat
 *
 *     if (boucles.length === 0 || deps.etat().zoneKey !== zoneKey) return  →  &&
 *
 * Un `&&` ne renonce que si les **deux** conditions sont vraies. Les boucles
 * de la Métropole s'ajouteraient donc à une zone qu'on vient de quitter :
 * l'asset met le temps qu'il met, et changer de zone pendant ce temps est
 * exactement ce qu'on fait quand la première a mis trop longtemps.
 *
 *     const fresh = boucles.filter((b) => !known.has(b.osmRelationId))  →  sans `!`
 *
 * Le dédoublonnage à l'envers : seules les boucles **déjà présentes**
 * seraient ajoutées, en double. La zone `rhone` porte quatre boucles ; on en
 * verrait huit, chacune deux fois dans la liste et deux fois sur la carte.
 *
 * ## Le piège de ce fichier, et pourquoi chaque test réimporte le module
 *
 * `bouclesPromise` est un **cache de module**, pas un état de la tranche : la
 * première réponse est mémorisée pour toute la session. Deux tests qui
 * partagent le module partagent donc sa réponse, et le second mesure ce que
 * le premier a laissé — la famille du §6ter, prise à l'endroit cette fois.
 *
 * `vi.resetModules()` avant chaque import rend chaque test indépendant. Ce
 * n'est pas une précaution de principe : sans lui, « l'asset indisponible »
 * et « la zone a changé » ne peuvent pas coexister dans le même fichier.
 */

const FETCHED_AT = '2026-08-31T00:00:00.000Z'
const BOUCLES = parseBouclesGeoJSON(metropole, FETCHED_AT)

/** Ce que le fichier d'assets rendra, décidé test par test. */
let asset: () => Promise<Response>

/** Un état de zone minimal, et la trace de ce que la tranche en fait. */
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

/**
 * Une tranche neuve sur un module neuf : voir l'en-tête. `import()` après
 * `resetModules` rend un `bouclesPromise` vierge.
 */
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
  asset = () => Promise.resolve(reponse(metropole))
  vi.stubGlobal('fetch', (url: unknown) => {
    requetes.push(String(url))
    return asset()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('les boucles locales ne s’invitent que là où elles existent', () => {
  it('une zone sans boucles locales ne va rien chercher', async () => {
    const { actions, etat } = await trancheFraiche('vosges', [])
    await actions.mergeLocalBoucles('vosges')
    expect(
      requetes,
      'l’asset des boucles de la Métropole était téléchargé pour une zone qui' +
        ' n’en contient aucune.',
    ).toEqual([])
    expect(etat.itineraries).toEqual([])
  })

  it('une zone qui en porte les ajoute, et recalcule la complétion', async () => {
    const { actions, etat, appels } = await trancheFraiche('rhone', [])
    await actions.mergeLocalBoucles('rhone')
    expect(etat.itineraries).toHaveLength(BOUCLES.length)
    expect(etat.itineraries.map((i) => i.osmRelationId)).toEqual(
      BOUCLES.map((b) => b.osmRelationId),
    )
    expect(
      appels.recompute,
      'les boucles étaient posées sans que la complétion soit recalculée :' +
        ' elles apparaissaient sans jamais compter.',
    ).toBe(1)
  })
})

describe('les boucles locales n’atterrissent pas dans une zone qu’on a quittée', () => {
  it('ne fusionne rien si la zone a changé pendant le téléchargement', async () => {
    // Mutant tué : `boucles.length === 0 || zoneKey changé` → `&&`.
    let livrer: (r: Response) => void = () => undefined
    asset = () =>
      new Promise<Response>((resolve) => {
        livrer = resolve
      })

    const { actions, etat, appels } = await trancheFraiche('rhone', [])
    const fusion = actions.mergeLocalBoucles('rhone')
    // Pendant que l'asset arrive, la personne est partie voir ailleurs.
    etat.zoneKey = 'vosges'
    livrer(reponse(metropole))
    await fusion

    expect(
      etat.itineraries,
      'les boucles de la Métropole s’ajoutaient à la zone affichée à leur' +
        ' arrivée, quelle qu’elle soit.',
    ).toEqual([])
    expect(appels.recompute).toBe(0)
  })

  it('ne fusionne rien si l’asset est indisponible', async () => {
    asset = () => Promise.resolve(new Response('', { status: 404 }))
    const { actions, etat, appels } = await trancheFraiche('rhone', [])
    await actions.mergeLocalBoucles('rhone')
    expect(etat.itineraries).toEqual([])
    expect(appels.recompute).toBe(0)
  })
})

describe('les boucles locales ne se comptent pas deux fois', () => {
  it('n’ajoute que celles qui manquent', async () => {
    // Mutant tué : `!known.has(...)` privé de son `!`. Sans la négation, ce
    // sont les boucles DÉJÀ là qui seraient rajoutées.
    const dejaLa = BOUCLES.slice(0, 2)
    const { actions, etat } = await trancheFraiche('rhone', [...dejaLa])
    await actions.mergeLocalBoucles('rhone')

    const ids = etat.itineraries.map((i) => i.osmRelationId)
    expect(
      ids,
      'le dédoublonnage rajoutait les boucles déjà présentes : la liste les' +
        ' montrait deux fois, et la carte les dessinait deux fois.',
    ).toEqual(BOUCLES.map((b) => b.osmRelationId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ne touche à rien quand elles sont toutes déjà là', async () => {
    const { actions, etat, appels } = await trancheFraiche('rhone', [
      ...BOUCLES,
    ])
    await actions.mergeLocalBoucles('rhone')
    expect(etat.itineraries).toHaveLength(BOUCLES.length)
    expect(
      appels.recompute,
      'la complétion était recalculée alors que rien n’avait changé — un' +
        ' calcul entier à chaque retour sur la zone.',
    ).toBe(0)
  })

  it('garde ce que la zone contenait déjà', async () => {
    const overpass = {
      ...BOUCLES[0],
      osmRelationId: 42,
      name: 'GR7',
    } as Itinerary
    const { actions, etat } = await trancheFraiche('rhone', [overpass])
    await actions.mergeLocalBoucles('rhone')
    expect(etat.itineraries[0]?.osmRelationId).toBe(42)
    expect(etat.itineraries).toHaveLength(1 + BOUCLES.length)
  })
})

describe('un échec ne se mémorise pas', () => {
  it('un second essai retrouve les boucles après un premier hors ligne', async () => {
    /*
      Le commentaire de `fetchLocalBoucles` affirme ceci mot pour mot :
      « Hors ligne au premier chargement, les boucles seraient sinon absentes
      pour toute la session, alors qu'un simple changement de zone suffirait
      à les retrouver. » Rien ne le vérifiait, et le §4bis dit ce que valent
      les justifications qu'on ne relit pas.

      Le cache vit dans le module : les deux essais partagent donc
      délibérément la même tranche — c'est le seul test du fichier où la
      persistance entre appels est le sujet, et non le piège.
    */
    asset = () => Promise.resolve(new Response('', { status: 503 }))
    const { actions, etat } = await trancheFraiche('rhone', [])
    await actions.mergeLocalBoucles('rhone')
    expect(etat.itineraries).toEqual([])

    asset = () => Promise.resolve(reponse(metropole))
    await actions.mergeLocalBoucles('rhone')

    expect(
      etat.itineraries,
      'un premier chargement hors ligne condamnait les boucles locales pour' +
        ' toute la session : elles ne revenaient qu’au rechargement de la page.',
    ).toHaveLength(BOUCLES.length)
    expect(requetes).toHaveLength(2)
  })
})

describe('les identifiants des boucles restent hors des plages réelles', () => {
  it('ne peuvent pas entrer en collision avec une relation OSM', async () => {
    // La garde est dans `core/boucles.ts` ; ce qui se vérifie ici, c'est
    // qu'elle survit à la fusion — c'est la fusion qui les met au contact
    // des itinéraires venus d'Overpass.
    const { actions, etat } = await trancheFraiche('rhone', [])
    await actions.mergeLocalBoucles('rhone')
    for (const it of etat.itineraries) {
      expect(it.osmRelationId).toBeGreaterThanOrEqual(LOCAL_RELATION_ID_BASE)
    }
  })
})
