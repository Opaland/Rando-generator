import { describe, it, expect } from 'vitest'
import {
  ALL_FILTERS,
  distanceFromMeters,
  estimateMinutes,
  itineraryFacts,
  itineraryShape,
  matchesFilters,
  parseElevationGain,
  parseMinutes,
} from '../../src/core/discovery.ts'
import { formatDuration } from '../../src/lib/format.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

function way(id: number, coords: LonLat[]): TrailWay {
  return { osmWayId: id, coords }
}

function itinerary(partial: Partial<Itinerary> = {}): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'PR 1',
    name: 'Boucle test',
    network: 'LOCAL',
    ways: [way(1, [[4.5, 45.4], [4.51, 45.4]])],
    totalMeters: 5_000,
    fetchedAt: '2026-08-19T00:00:00Z',
    ...partial,
  }
}

describe('parseMinutes', () => {
  it('lit les durées publiées par la Métropole de Lyon', () => {
    // Formats réellement présents dans l'open data : « 1h30 », « 2h00 », « 3 h ».
    expect(parseMinutes('1h30')).toBe(90)
    expect(parseMinutes('2h00')).toBe(120)
    expect(parseMinutes('3 h')).toBe(180)
    expect(parseMinutes('2h55')).toBe(175)
  })

  it('accepte les variantes de saisie', () => {
    expect(parseMinutes('2 H 05')).toBe(125)
    expect(parseMinutes('45 min')).toBe(45)
    expect(parseMinutes('45mn')).toBe(45)
    expect(parseMinutes('1h15mn')).toBe(75)
  })

  it('refuse ce qu’elle ne comprend pas plutôt que d’inventer', () => {
    expect(parseMinutes(null)).toBeNull()
    expect(parseMinutes('')).toBeNull()
    expect(parseMinutes('une bonne demi-journée')).toBeNull()
    expect(parseMinutes('2')).toBeNull()
  })

  it('écarte une durée absurde', () => {
    // Une randonnée à la journée ne dure pas 99 heures : c'est une coquille
    // de saisie, pas une donnée.
    expect(parseMinutes('99h00')).toBeNull()
    expect(parseMinutes('0h00')).toBeNull()
  })
})

describe('parseElevationGain', () => {
  it('lit les dénivelés publiés', () => {
    expect(parseElevationGain('129 m')).toBe(129)
    expect(parseElevationGain('1 200 m')).toBe(1200)
    expect(parseElevationGain('306m')).toBe(306)
    expect(parseElevationGain('0 m')).toBe(0)
  })

  it('refuse ce qu’elle ne comprend pas', () => {
    expect(parseElevationGain(null)).toBeNull()
    expect(parseElevationGain('vallonné')).toBeNull()
  })
})

describe('estimateMinutes', () => {
  it('compte le plat à quatre kilomètres-heure', () => {
    expect(estimateMinutes(8_000, 0)).toBe(120)
  })

  it('ajoute une heure par tranche de 300 m de montée', () => {
    // Règle de terrain française : 300 m de dénivelé positif à l'heure.
    expect(estimateMinutes(8_000, 300)).toBe(180)
  })

  it('sans dénivelé connu, n’en invente pas', () => {
    expect(estimateMinutes(8_000, null)).toBe(120)
  })

  it('reste à zéro pour une longueur nulle', () => {
    expect(estimateMinutes(0, null)).toBe(0)
  })
})

describe('itineraryShape', () => {
  it('reconnaît une boucle fermée d’un seul tronçon', () => {
    const carre: LonLat[] = [
      [4.5, 45.4],
      [4.51, 45.4],
      [4.51, 45.41],
      [4.5, 45.41],
      [4.5, 45.4],
    ]
    expect(itineraryShape([way(1, carre)])).toBe('loop')
  })

  it('reconnaît une boucle formée de plusieurs tronçons', () => {
    expect(
      itineraryShape([
        way(1, [[4.5, 45.4], [4.51, 45.4]]),
        way(2, [[4.51, 45.4], [4.51, 45.41]]),
        way(3, [[4.51, 45.41], [4.5, 45.4]]),
      ]),
    ).toBe('loop')
  })

  it('reconnaît un aller simple', () => {
    expect(
      itineraryShape([
        way(1, [[4.5, 45.4], [4.51, 45.4]]),
        way(2, [[4.51, 45.4], [4.52, 45.4]]),
      ]),
    ).toBe('linear')
  })

  it('considère comme boucle un circuit dont départ et arrivée se frôlent', () => {
    // Deux points distants de quelques dizaines de mètres (parking, place de
    // village) : personne n'appellerait cela un aller simple.
    expect(
      itineraryShape([
        way(1, [[4.5, 45.4], [4.51, 45.41]]),
        way(2, [[4.51, 45.41], [4.5001, 45.4]]),
      ]),
    ).toBe('loop')
  })

  it('ne tranche pas sur un réseau ramifié', () => {
    // Un GR avec ses variantes n'est ni une boucle ni un aller simple :
    // annoncer l'un ou l'autre serait une invention.
    expect(
      itineraryShape([
        way(1, [[4.5, 45.4], [4.51, 45.4]]),
        way(2, [[4.51, 45.4], [4.52, 45.4]]),
        way(3, [[4.51, 45.4], [4.51, 45.41]]),
      ]),
    ).toBe('unknown')
  })

  it('ne tranche pas sans géométrie', () => {
    expect(itineraryShape([])).toBe('unknown')
    expect(itineraryShape([way(1, [[4.5, 45.4]])])).toBe('unknown')
  })
})

describe('itineraryFacts', () => {
  it('préfère la durée publiée à une estimation', () => {
    const facts = itineraryFacts(
      itinerary({
        totalMeters: 8_000,
        details: {
          source: 'Métropole de Lyon',
          commune: 'Vaugneray',
          difficulte: 'moyen',
          temps: '1h30',
          denivele: '129 m',
          descriptif: null,
          lienWeb: null,
        },
      }),
    )
    expect(facts.minutes).toBe(90)
    expect(facts.minutesSource).toBe('published')
    expect(facts.gainMeters).toBe(129)
  })

  it('estime la durée quand la source ne la publie pas', () => {
    const facts = itineraryFacts(itinerary({ totalMeters: 8_000 }))
    expect(facts.minutesSource).toBe('estimated')
    expect(facts.minutes).toBe(120)
    expect(facts.gainMeters).toBeNull()
  })

  it('retient la forme du tracé', () => {
    expect(itineraryFacts(itinerary()).shape).toBe('linear')
  })
})

describe('distanceFromMeters', () => {
  const trace = itinerary({
    ways: [
      way(1, [
        [4.5, 45.4],
        [4.6, 45.4],
      ]),
    ],
  })

  it('mesure jusqu’au point le plus proche du tracé, pas jusqu’au départ', () => {
    // Au milieu du tracé, mais à 1 km au nord : l'itinéraire est à 1 km,
    // même si son départ est à 4 km.
    const depuis: LonLat = [4.55, 45.409]
    expect(distanceFromMeters(trace, depuis)).toBeLessThan(1_100)
    expect(distanceFromMeters(trace, depuis)).toBeGreaterThan(900)
  })

  it('vaut zéro sur le tracé', () => {
    expect(distanceFromMeters(trace, [4.55, 45.4])).toBeLessThan(5)
  })

  it('reste juste sur une longue géométrie éclaircie', () => {
    // Au-delà de quelques centaines de points, la géométrie est échantillonnée.
    // La fin du tronçon doit rester mesurée : un GR de 500 km ne doit pas
    // paraître lointain parce que son dernier kilomètre a été sauté.
    const points: LonLat[] = []
    for (let i = 0; i < 500; i++) points.push([4.5 + i * 0.001, 45.4])
    const longue = itinerary({ ways: [way(1, points)] })
    const finDuTrace: LonLat = [4.5 + 499 * 0.001, 45.4]
    expect(distanceFromMeters(longue, finDuTrace)).toBeLessThan(5)
  })

  it('retourne null sans géométrie', () => {
    expect(distanceFromMeters(itinerary({ ways: [] }), [4.5, 45.4])).toBeNull()
  })
})

describe('matchesFilters', () => {
  const facts = {
    meters: 10_000,
    gainMeters: 300,
    minutes: 180,
    minutesSource: 'published' as const,
    shape: 'loop' as const,
    awayMeters: 5_000,
    entierementRoulant: false,
  }

  it('laisse tout passer par défaut', () => {
    expect(matchesFilters(facts, ALL_FILTERS)).toBe(true)
  })

  it('filtre par longueur', () => {
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxKm: 8 })).toBe(false)
    expect(matchesFilters(facts, { ...ALL_FILTERS, minKm: 12 })).toBe(false)
    expect(matchesFilters(facts, { ...ALL_FILTERS, minKm: 5, maxKm: 15 })).toBe(
      true,
    )
  })

  it('filtre par dénivelé et par durée', () => {
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxGain: 200 })).toBe(false)
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxMinutes: 120 })).toBe(
      false,
    )
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxMinutes: 240 })).toBe(true)
  })

  it('filtre par proximité', () => {
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxAwayKm: 3 })).toBe(false)
    expect(matchesFilters(facts, { ...ALL_FILTERS, maxAwayKm: 10 })).toBe(true)
  })

  it('filtre par forme du tracé', () => {
    expect(matchesFilters(facts, { ...ALL_FILTERS, shape: 'loop' })).toBe(true)
    expect(matchesFilters(facts, { ...ALL_FILTERS, shape: 'linear' })).toBe(
      false,
    )
  })

  it('n’exclut pas un itinéraire faute de donnée', () => {
    // Un dénivelé inconnu n'est pas un dénivelé énorme : filtrer dessus
    // ferait disparaître la quasi-totalité des tracés OSM sans le dire.
    const inconnu = { ...facts, gainMeters: null, awayMeters: null }
    expect(matchesFilters(inconnu, { ...ALL_FILTERS, maxGain: 10 })).toBe(true)
    expect(matchesFilters(inconnu, { ...ALL_FILTERS, maxAwayKm: 1 })).toBe(true)
  })

  it('n’exclut pas un tracé de forme indéterminée quand on ne filtre pas dessus', () => {
    const ramifie = { ...facts, shape: 'unknown' as const }
    expect(matchesFilters(ramifie, ALL_FILTERS)).toBe(true)
    expect(matchesFilters(ramifie, { ...ALL_FILTERS, shape: 'loop' })).toBe(
      false,
    )
  })
})

describe('formatDuration', () => {
  it('écrit une durée comme on la dit', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(150)).toBe('2 h 30')
    expect(formatDuration(125)).toBe('2 h 05')
  })

  it('ne descend pas sous zéro', () => {
    expect(formatDuration(-10)).toBe('0 min')
  })
})

/**
 * Le filtre du sol (issue #179), et l'exception qu'il assume.
 *
 * Tous les autres filtres laissent passer une donnée absente : ne pas
 * connaître le dénivelé d'un itinéraire ne doit pas le faire disparaître
 * d'une recherche. Celui-ci fait l'inverse, et c'est délibéré.
 *
 * Nadia sort avec sa fille en fauteuil tout-terrain. Laisser passer
 * l'inconnu lui promettrait un chemin roulant qu'on n'a jamais vérifié — et
 * ce qu'elle redoute n'est pas la donnée manquante, qu'elle sait lire, mais
 * exactement cette promesse-là.
 */
describe('filtre du sol — l’inconnu est écarté (#179)', () => {
  const facts = {
    meters: 10_000,
    gainMeters: 300,
    minutes: 180,
    minutesSource: 'published' as const,
    shape: 'loop' as const,
    awayMeters: 5_000,
    entierementRoulant: false,
  }

  it('garde un itinéraire entièrement dur ou stabilisé', () => {
    const roulant = { ...facts, entierementRoulant: true }
    expect(matchesFilters(roulant, { ...ALL_FILTERS, sol: 'roulant' })).toBe(
      true,
    )
  })

  it('écarte un itinéraire dont une part est inconnue', () => {
    expect(
      matchesFilters(facts, { ...ALL_FILTERS, sol: 'roulant' }),
      'un itinéraire dont on ignore le sol a été présenté comme roulant',
    ).toBe(false)
  })

  it('sans filtre, l’inconnu passe comme tout le reste', () => {
    expect(matchesFilters(facts, ALL_FILTERS)).toBe(true)
  })
})

describe('itineraryFacts — entierementRoulant', () => {
  function itin(surfaces: (string | undefined)[]): Itinerary {
    return {
      osmRelationId: 7,
      ref: null,
      name: null,
      network: 'PR',
      totalMeters: 1_000,
      fetchedAt: '2026-08-25T00:00:00Z',
      ways: surfaces.map((surface, i) => ({
        osmWayId: 500 + i,
        coords: [
          [4.5 + i * 0.001, 45.4],
          [4.5 + i * 0.001 + 0.0001, 45.4],
        ] as LonLat[],
        ...(surface === undefined ? {} : { tags: { surface } }),
      })),
    }
  }

  it('vrai quand tout est dur ou stabilisé', () => {
    expect(itineraryFacts(itin(['asphalt', 'compacted'])).entierementRoulant).toBe(
      true,
    )
  })

  it('faux dès qu’un seul tronçon est inconnu', () => {
    expect(
      itineraryFacts(itin(['asphalt', 'asphalt', undefined]))
        .entierementRoulant,
      'un tronçon non renseigné suffit à ne plus rien pouvoir promettre',
    ).toBe(false)
  })

  it('faux dès qu’un seul tronçon est naturel', () => {
    expect(
      itineraryFacts(itin(['asphalt', 'ground'])).entierementRoulant,
    ).toBe(false)
  })

  /**
   * Les parts sont des divisions en virgule flottante : sur vingt tronçons,
   * leur somme peut retomber sur 0,9999999999999998. Sans la marge de
   * `TOUT`, un itinéraire entièrement bitumé serait écarté pour une erreur
   * d'arrondi — et le défaut serait invisible, puisqu'il ne toucherait que
   * certains itinéraires.
   */
  it('vingt tronçons bitumés restent roulants malgré l’arrondi', () => {
    const vingt = Array.from({ length: 20 }, () => 'asphalt')
    expect(itineraryFacts(itin(vingt)).entierementRoulant).toBe(true)
  })
})
