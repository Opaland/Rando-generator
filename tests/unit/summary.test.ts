import { describe, it, expect } from 'vitest'
import { buildSummary, summaryFilename } from '../../src/core/summary.ts'
import type {
  CompletionResult,
  Itinerary,
  Network,
  Track,
} from '../../src/core/types.ts'

function itinerary(id: number, ref: string, network: Network = 'GR'): Itinerary {
  return {
    osmRelationId: id,
    ref,
    name: null,
    network,
    ways: [],
    totalMeters: 10_000,
    fetchedAt: '2026-08-19T00:00:00Z',
  }
}

function result(id: number, pct: number): CompletionResult {
  return {
    itineraryId: id,
    pct,
    doneMeters: (pct / 100) * 10_000,
    totalMeters: 10_000,
    computedAt: '2026-08-19T00:00:00Z',
  }
}

function track(id: string, date: string | null): Track {
  return {
    id,
    filename: `${id}.gpx`,
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ],
    date,
    importedAt: '2026-08-19T00:00:00Z',
  }
}

const global = { doneMeters: 12_000, totalMeters: 30_000, pct: 40 }

describe('buildSummary', () => {
  it('reprend les chiffres globaux', () => {
    const bilan = buildSummary({
      global,
      results: [result(1, 80)],
      itineraries: [itinerary(1, 'GR 7')],
      tracks: [track('a', '2026-06-01T08:00:00Z')],
      zoneLabel: 'PNR du Pilat',
    })
    expect(bilan.pct).toBe(40)
    expect(bilan.doneMeters).toBe(12_000)
    expect(bilan.zoneLabel).toBe('PNR du Pilat')
    expect(bilan.outings).toBe(1)
  })

  it('classe les itinéraires les plus avancés, jamais ceux à zéro', () => {
    // Un itinéraire jamais foulé n'a rien à faire dans un bilan de sortie.
    const bilan = buildSummary({
      global,
      results: [result(1, 80), result(2, 0), result(3, 95)],
      itineraries: [
        itinerary(1, 'GR 7'),
        itinerary(2, 'GR 3'),
        itinerary(3, 'GR 65'),
      ],
      tracks: [],
    })
    expect(bilan.top.map((t) => t.name)).toEqual(['GR 65', 'GR 7'])
    expect(bilan.top[0]?.completed).toBe(true)
    expect(bilan.top[1]?.completed).toBe(false)
  })

  it('limite le classement pour rester lisible', () => {
    const nombreux = Array.from({ length: 12 }, (_, i) => i + 1)
    const bilan = buildSummary({
      global,
      results: nombreux.map((i) => result(i, 90 - i)),
      itineraries: nombreux.map((i) => itinerary(i, `GR ${i}`)),
      tracks: [],
    })
    expect(bilan.top).toHaveLength(5)
  })

  it('résume la période couverte par les sorties datées', () => {
    const bilan = buildSummary({
      global,
      results: [],
      itineraries: [],
      tracks: [
        track('a', '2025-04-10T08:00:00Z'),
        track('b', '2026-06-01T08:00:00Z'),
        track('c', null),
      ],
    })
    expect(bilan.outings).toBe(3)
    expect(bilan.period).toEqual({ from: '2025-04-10', to: '2026-06-01' })
  })

  it('n’invente pas de période sans sortie datée', () => {
    const bilan = buildSummary({
      global,
      results: [],
      itineraries: [],
      tracks: [track('a', null)],
    })
    expect(bilan.period).toBeNull()
  })

  it('ignore un résultat dont l’itinéraire a disparu', () => {
    const bilan = buildSummary({
      global,
      results: [result(99, 50)],
      itineraries: [itinerary(1, 'GR 7')],
      tracks: [],
    })
    expect(bilan.top).toEqual([])
  })
})

describe('summaryFilename', () => {
  it('nomme le fichier par la date du jour', () => {
    expect(summaryFilename('2026-08-19T22:15:00Z')).toBe(
      'bilan-sentiers-2026-08-19.png',
    )
  })

  it('se rabat sur un nom sans date si l’horodatage est illisible', () => {
    expect(summaryFilename('n’importe quoi')).toBe('bilan-sentiers.png')
  })
})

/**
 * Les réseaux que le bilan remonte (issue #388).
 *
 * ## Pourquoi ces trois cas et pas un seul
 *
 * L'image de partage crédite ses sources d'après ce champ. Sans lui elle ne
 * peut pas savoir qu'elle affiche une boucle de la Métropole, et c'est le
 * défaut qu'on corrige.
 *
 * Des provenances lues par `attributionDe` et non des réseaux : un fichier
 * importé déclare la sienne, et la déduire de son réseau créditerait le
 * PDIPR de Léa à OpenStreetMap (issue #87).
 *
 * **Ce fichier a été écrit parce qu'une injection est restée verte.** Poser
 * `reseaux: []` en dur dans `buildSummary` ne faisait rougir aucun test :
 * ceux de la carte passent un bilan fabriqué à la main, et le maillon
 * « itinéraires → réseaux » n'était éprouvé nulle part. Toute la chaîne
 * paraissait gardée, et son premier maillon ne l'était pas (§1).
 */
describe('buildSummary — les provenances dont les chiffres sont tirés', () => {
  it('remonte la provenance des itinéraires chargés', () => {
    const bilan = buildSummary({
      global,
      results: [result(1, 50)],
      itineraries: [itinerary(1, 'GR 7')],
      tracks: [],
    })
    expect(bilan.sources.map((s) => s.author)).toEqual([
      'les contributeurs OpenStreetMap',
    ])
  })

  it('les remonte tous, sans doublon', () => {
    const bilan = buildSummary({
      global,
      results: [result(1, 50)],
      itineraries: [
        itinerary(1, 'GR 7'),
        itinerary(2, 'GR 42'),
        itinerary(3, 'Boucle', 'LOCAL'),
      ],
      tracks: [],
    })
    expect(bilan.sources.map((s) => s.author).sort()).toEqual([
      'Métropole de Lyon',
      'les contributeurs OpenStreetMap',
    ])
  })

  /*
    Sur **tous** les itinéraires chargés, et non sur ceux du `top`.

    `totalMeters` les compte tous, y compris ceux à 0 % que le `top` écarte :
    le chiffre affiché est donc tiré de la boucle de la Métropole même si
    personne ne l'a encore parcourue, et le crédit lui est dû quand même.

    Sans ce cas, dériver les réseaux du `top` passerait les deux tests
    précédents.
  */
  it('compte un itinéraire jamais parcouru, que le top écarte', () => {
    const bilan = buildSummary({
      global,
      results: [result(1, 50), result(3, 0)],
      itineraries: [itinerary(1, 'GR 7'), itinerary(3, 'Boucle', 'LOCAL')],
      tracks: [],
    })
    expect(bilan.top.map((l) => l.name)).toEqual(['GR 7'])
    expect(bilan.sources.map((s) => s.author).sort()).toEqual([
      'Métropole de Lyon',
      'les contributeurs OpenStreetMap',
    ])
  })

  /*
    Le cas de Léa (#87), à l'autre bout de la chaîne : sa provenance déclarée
    remonte telle quelle, sans repli sur le réseau.
  */
  it('préfère la source qu’un itinéraire déclare à celle de son réseau', () => {
    const pdipr: Itinerary = {
      ...itinerary(9, 'PDIPR 01', 'PERSO'),
      attribution: {
        author: 'Département de l’Ain',
        license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
      },
    }
    const bilan = buildSummary({
      global,
      results: [result(9, 30)],
      itineraries: [pdipr],
      tracks: [],
    })
    expect(bilan.sources.map((s) => s.author)).toEqual(['Département de l’Ain'])
  })

  /*
    Et un tracé réellement dessiné à la main ne doit rien. Sans ce cas, un
    repli « toujours OpenStreetMap » passerait tous les autres.
  */
  it('ne remonte aucune provenance pour un tracé dessiné à la main', () => {
    const bilan = buildSummary({
      global,
      results: [result(9, 30)],
      itineraries: [itinerary(9, 'Mon tracé', 'PERSO')],
      tracks: [],
    })
    expect(bilan.sources).toEqual([])
  })
})
