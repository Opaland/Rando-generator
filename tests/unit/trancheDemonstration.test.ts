import { describe, it, expect } from 'vitest'
import {
  trancheDemonstration,
  type DependancesDemonstration,
  type EcritureDemonstration,
} from '../../src/store/trancheDemonstration.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { Itinerary, Track } from '../../src/core/types.ts'
import type { ParcoursDeclare } from '../../src/core/declaratif.ts'
import type { SentiersDb } from '../../src/db/database.ts'

/**
 * La tranche « démonstration » du store (issue #155, sixième tranche).
 *
 * Ces tests tiennent une cicatrice que rien ne tenait : le commentaire de
 * `quitterDemonstration` affirmait « la base n'a jamais rien reçu de la
 * démonstration, donc rien n'est perdu ». Vrai quand il a été écrit, faux
 * ensuite — les déclarations de parcours (#158) sont arrivées après, et la
 * relecture ne les reprenait pas.
 *
 * Le défaut restait **latent** : l'entrée de la démonstration ne vit que dans
 * le guide de premier lancement, qu'un revenant — le seul à pouvoir avoir des
 * déclarations — a déjà fermé. Un accident de navigation protégeait, pas une
 * garantie, et un accident se défait sans prévenir.
 */

/*
  Trois boucles, pas une.

  `construireDemonstration` en exige au moins autant que de sorties à
  fabriquer, et rend `[]` en deçà — c'est la garde corrigée le 23/08, qui
  exigeait auparavant un itinéraire de plus que nécessaire. Une fixture d'une
  seule boucle tombait donc dans le chemin « démonstration impossible » en
  croyant tester le chemin nominal.
*/
const BOUCLES = [1, 2, 3].map((n) =>
  makeItinerary(2_000_000_000 + n, [
    { osmWayId: n, coords: straightLine(4.8 + n / 100, 45.8, 3_000, 40) },
  ]),
)

/** Une base qui rend ce qu'on lui a mis, et compte ses lectures. */
function base(contenu: {
  tracks?: Track[]
  customItineraries?: Itinerary[]
  parcoursDeclares?: ParcoursDeclare[]
}) {
  const lectures: string[] = []
  const db = {
    listTracks: () => {
      lectures.push('tracks')
      return Promise.resolve(contenu.tracks ?? [])
    },
    listCustomItineraries: () => {
      lectures.push('customItineraries')
      return Promise.resolve(contenu.customItineraries ?? [])
    },
    listerParcoursDeclares: () => {
      lectures.push('parcoursDeclares')
      return Promise.resolve(contenu.parcoursDeclares ?? [])
    },
  } as unknown as SentiersDb
  return { db, lectures }
}

function banc(options: {
  demonstration?: boolean
  tracks?: Track[]
  zoneKey?: string | null
  boucles?: Itinerary[]
  db?: SentiersDb | null
} = {}) {
  const ecrits: Partial<EcritureDemonstration>[] = []
  const journal: string[] = []
  let etat = {
    demonstration: options.demonstration ?? false,
    tracks: options.tracks ?? [],
    zoneKey: options.zoneKey ?? null,
  }
  const deps: DependancesDemonstration = {
    set: (partiel) => {
      ecrits.push(partiel)
      etat = {
        demonstration: partiel.demonstration ?? etat.demonstration,
        tracks: partiel.tracks ?? etat.tracks,
        zoneKey:
          'zoneKey' in partiel ? (partiel.zoneKey ?? null) : etat.zoneKey,
      }
    },
    lire: () => etat,
    bouclesLocales: () => Promise.resolve(options.boucles ?? BOUCLES),
    baseOuverte: () => Promise.resolve(options.db ?? null),
    recalculer: () => {
      journal.push('recalculer')
      return Promise.resolve()
    },
    maintenant: () => '2026-08-27T09:00:00.000Z',
  }
  /** Tout ce qui a été écrit, aplati — l'état final vu par le store. */
  const final = () => Object.assign({}, ...ecrits) as Record<string, unknown>
  return { deps, ecrits, journal, final }
}

describe('demarrerDemonstration', () => {
  it('ouvre la zone de démonstration sur des boucles réelles', async () => {
    const { deps, final } = banc()
    await trancheDemonstration(deps).demarrerDemonstration()
    expect(final()['demonstration']).toBe(true)
    expect(final()['zoneKey']).toBe('demonstration')
    expect(final()['itineraries']).toEqual(BOUCLES)
  })

  it('date les sorties fictives de l’instant fourni', async () => {
    // `maintenant` est injecté pour cette raison : une date qui change à
    // chaque seconde ne s'asserte pas.
    const { deps, final } = banc()
    await trancheDemonstration(deps).demarrerDemonstration()
    const traces = final()['tracks'] as Track[]
    expect(traces.length).toBeGreaterThan(0)
    expect(traces[0]?.date).toBe('2026-08-27T09:00:00.000Z')
    expect(traces[0]?.importedAt).toBe('2026-08-27T09:00:00.000Z')
  })

  it('dit pourquoi plutôt que d’ouvrir une démonstration vide', async () => {
    // Sans boucle exploitable, il n'y a rien à montrer. Ouvrir quand même
    // afficherait une carte vide sous le mot « Démonstration ».
    const { deps, final } = banc({ boucles: [] })
    await trancheDemonstration(deps).demarrerDemonstration()
    expect(final()['demonstration']).toBeUndefined()
    expect(String(final()['zoneError'])).toMatch(/n’a pas pu être préparée/)
  })
})

describe('arreterDemonstration', () => {
  const FICTIVE: Track = {
    id: 'demo-42',
    filename: 'Sortie de démonstration',
    points: [
      [4.8, 45.8],
      [4.81, 45.8],
    ],
    date: '2026-08-27T09:00:00.000Z',
    importedAt: '2026-08-27T09:00:00.000Z',
  }
  const VRAIE: Track = { ...FICTIVE, id: 'vraie', filename: 'a.gpx' }

  it('retire les sorties fictives et garde les vraies', async () => {
    const { deps, final } = banc({
      demonstration: true,
      tracks: [FICTIVE, VRAIE],
      zoneKey: 'demonstration',
    })
    await trancheDemonstration(deps).arreterDemonstration()
    expect((final()['tracks'] as Track[]).map((t) => t.id)).toEqual(['vraie'])
  })

  it('renomme la zone pour ce qu’elle est vraiment', async () => {
    // Les boucles restent : elles sont réelles et sous licence ouverte. Ce
    // qui part, ce sont les sorties inventées — pas la carte.
    const { deps, final } = banc({
      demonstration: true,
      tracks: [FICTIVE],
      zoneKey: 'demonstration',
    })
    await trancheDemonstration(deps).arreterDemonstration()
    expect(final()['zoneKey']).toBe('boucles-lyon')
    expect(final()['zoneLabel']).toBe('Boucles communales — Métropole de Lyon')
    expect(final()['itineraries']).toBeUndefined()
  })

  it('ne renomme pas une zone que l’utilisateur a choisie entre-temps', async () => {
    /*
      Le cas qui se perd facilement : on démarre la démonstration, puis on
      charge le Pilat. Renommer alors en « Boucles communales » écraserait le
      choix de quelqu'un par un libellé qui ne décrit pas ce qu'il regarde.
    */
    const { deps, final } = banc({
      demonstration: true,
      tracks: [FICTIVE],
      zoneKey: 'pilat',
    })
    await trancheDemonstration(deps).arreterDemonstration()
    expect(final()['zoneKey']).toBe('pilat')
    expect(final()['zoneLabel']).toBeUndefined()
  })

  it('ne fait rien quand la démonstration ne tourne pas', async () => {
    const { deps, ecrits, journal } = banc({ demonstration: false })
    await trancheDemonstration(deps).arreterDemonstration()
    expect(ecrits).toHaveLength(0)
    expect(journal).not.toContain('recalculer')
  })
})

describe('quitterDemonstration', () => {
  it('relit les trois listes, déclarations comprises', async () => {
    /*
      **La cicatrice.** Le commentaire affirmait « rien n'est perdu » alors
      que les déclarations de parcours n'étaient pas relues — elles sont
      arrivées après lui (§4bis : une justification vieillit comme le reste,
      et personne ne la relit).

      Le test asserte les **trois** lectures. Une quatrième liste qui
      arriverait un jour ferait échouer la relecture ici plutôt que sur le
      terrain.
    */
    const declares: ParcoursDeclare[] = [
      { itineraryId: 7, date: '2026-08-20', declareLe: '2026-08-20T10:00:00Z' },
    ]
    const { db, lectures } = base({ parcoursDeclares: declares })
    const { deps, final } = banc({ demonstration: true, db })
    await trancheDemonstration(deps).quitterDemonstration()
    expect(lectures.sort()).toEqual([
      'customItineraries',
      'parcoursDeclares',
      'tracks',
    ])
    expect(final()['parcoursDeclares']).toEqual(declares)
  })

  it('remet la carte à zéro avant de relire', async () => {
    const { db } = base({})
    const { deps, ecrits } = banc({ demonstration: true, db })
    await trancheDemonstration(deps).quitterDemonstration()
    const premier = ecrits[0]
    expect(premier?.zoneKey).toBeNull()
    expect(premier?.itineraries).toEqual([])
    expect(premier?.demonstration).toBe(false)
  })

  it('tient sans base : la démonstration se quitte quand même', async () => {
    // Un navigateur en navigation privée peut refuser IndexedDB. Rester
    // coincé en démonstration serait pire que revenir à un écran vide.
    const { deps, final, journal } = banc({ demonstration: true, db: null })
    await trancheDemonstration(deps).quitterDemonstration()
    expect(final()['demonstration']).toBe(false)
    expect(journal).toContain('recalculer')
  })

  it('ne fait rien quand la démonstration ne tourne pas', async () => {
    const { deps, ecrits } = banc({ demonstration: false })
    await trancheDemonstration(deps).quitterDemonstration()
    expect(ecrits).toHaveLength(0)
  })
})

describe('les trois sorties ne se confondent pas', () => {
  it('arrêter garde la carte, quitter la vide', async () => {
    /*
      C'est la distinction que le découpage rend visible, et qu'un fichier de
      mille quatre cents lignes noyait : `arreterDemonstration` retire les
      sorties inventées et **garde les boucles**, `quitterDemonstration` rend
      la main à ce qui existait avant. Les confondre ferait perdre la carte à
      qui voulait juste arrêter de jouer.
    */
    const fictive: Track = {
      id: 'demo-1',
      filename: 'demo',
      points: [
        [4.8, 45.8],
        [4.81, 45.8],
      ],
      date: null,
      importedAt: '2026-08-27T09:00:00.000Z',
    }
    const arret = banc({
      demonstration: true,
      tracks: [fictive],
      zoneKey: 'demonstration',
    })
    await trancheDemonstration(arret.deps).arreterDemonstration()
    expect(arret.final()['itineraries']).toBeUndefined()

    const { db } = base({})
    const sortie = banc({
      demonstration: true,
      tracks: [fictive],
      zoneKey: 'demonstration',
      db,
    })
    await trancheDemonstration(sortie.deps).quitterDemonstration()
    expect(sortie.final()['itineraries']).toEqual([])
  })
})
