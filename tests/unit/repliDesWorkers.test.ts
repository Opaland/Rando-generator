import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MatchResult } from '../../src/core/matching.ts'
import type { MatchRequest } from '../../src/workers/matching.worker.ts'
import type { MatchingInput } from '../../src/store/matchingClient.ts'

/**
 * Ce que `matchingClient.ts` promet quand le Web Worker n'est pas disponible
 * (#471).
 *
 * Son commentaire annonçait un repli synchrone « CSP, build… » ; sondé avec
 * des doublures, ni le constructeur qui jette ni la neutralisation n'étaient
 * vrais. Ce fichier pose les questions que ce commentaire prétendait tenir.
 *
 * Le module garde son worker dans une variable de module : chaque question
 * le réimporte après `vi.resetModules()` pour repartir d'un état neuf.
 */

const ENTREE: MatchingInput = {
  itineraries: [],
  trackPoints: [],
  toleranceMeters: 25,
  stepMeters: 10,
  computedAt: '2026-09-02T00:00:00.000Z',
}

/**
 * Un résultat qu'aucun calcul ne peut produire : s'il ressort de
 * `computeMatching`, c'est que le chemin du worker a bien été emprunté.
 */
const VENU_DU_WORKER = {
  samples: [],
  results: [],
  global: { doneMeters: 424242, totalMeters: 424242, pct: 100 },
  byNetwork: {},
} as unknown as MatchResult

async function chargerLeClient() {
  vi.resetModules()
  return await import('../../src/store/matchingClient.ts')
}

/** Doublure qui répond comme le vrai worker : un message par requête. */
class WorkerQuiRepond {
  static construits = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()

  constructor() {
    WorkerQuiRepond.construits += 1
  }

  postMessage(requete: MatchRequest) {
    queueMicrotask(() => {
      this.onmessage?.({
        data: { requestId: requete.requestId, result: VENU_DU_WORKER },
      } as MessageEvent)
    })
  }
}

/** Doublure qui part en erreur au premier envoi, comme un worker mort-né. */
class WorkerQuiCasse {
  static construits = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  terminate = vi.fn()

  constructor() {
    WorkerQuiCasse.construits += 1
  }

  postMessage() {
    queueMicrotask(() => {
      this.onerror?.()
    })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  WorkerQuiRepond.construits = 0
  WorkerQuiCasse.construits = 0
})

describe('le repli quand le Web Worker manque', () => {
  it('emprunte bien le worker quand il en existe un', async () => {
    vi.stubGlobal('Worker', WorkerQuiRepond)
    const { computeMatching } = await chargerLeClient()

    const resultat = await computeMatching(ENTREE)

    // Sans cette question, les trois suivantes pourraient toutes passer sur
    // un chemin synchrone qui n'a jamais vu de worker.
    expect(resultat).toBe(VENU_DU_WORKER)
    expect(WorkerQuiRepond.construits).toBe(1)
  })

  it("ne rejette pas quand une CSP interdit de construire le worker", async () => {
    vi.stubGlobal('Worker', function WorkerInterdit() {
      throw new DOMException('refusé par la politique', 'SecurityError')
    })
    const { computeMatching } = await chargerLeClient()

    // Un rejet ici laisserait `matchingBusy` levé pour toujours dans le
    // store : l'application resterait sur « calcul en cours ».
    const resultat = await computeMatching(ENTREE)

    expect(resultat.global.doneMeters).toBe(0)
    expect(resultat.results).toEqual([])
  })

  it('ne reconstruit pas un worker qui a déjà cassé', async () => {
    vi.stubGlobal('Worker', WorkerQuiCasse)
    const { computeMatching } = await chargerLeClient()

    const premier = await computeMatching(ENTREE)
    const second = await computeMatching(ENTREE)

    expect(WorkerQuiCasse.construits).toBe(1)
    expect(premier.global.doneMeters).toBe(0)
    expect(second.global.doneMeters).toBe(0)
  })

  it('ne laisse pas la promesse en suspens quand le worker casse', async () => {
    vi.stubGlobal('Worker', WorkerQuiCasse)
    const { computeMatching } = await chargerLeClient()

    const course = await Promise.race([
      computeMatching(ENTREE).then(() => 'résolu'),
      new Promise((resolve) => setTimeout(() => { resolve('en suspens') }, 200)),
    ])

    expect(course).toBe('résolu')
  })

  it('rend à chaque calcul concurrent le résultat de sa propre requête', async () => {
    const envoyes: number[] = []
    class WorkerQuiCompte extends WorkerQuiRepond {
      override postMessage(requete: MatchRequest) {
        envoyes.push(requete.requestId)
        super.postMessage(requete)
      }
    }
    vi.stubGlobal('Worker', WorkerQuiCompte)
    const { computeMatching } = await chargerLeClient()

    const [a, b] = await Promise.all([
      computeMatching(ENTREE),
      computeMatching(ENTREE),
    ])

    // Deux requêtes distinctes, un seul worker, et chacune reçoit sa réponse.
    expect(envoyes).toEqual([1, 2])
    expect(WorkerQuiRepond.construits).toBe(1)
    expect(a).toBe(VENU_DU_WORKER)
    expect(b).toBe(VENU_DU_WORKER)
  })
})
