import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STAGE_METERS,
  MIN_STAGED_METERS,
  buildStages,
} from '../../src/core/stages.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { Itinerary, LonLat, Sample, TrailWay } from '../../src/core/types.ts'
import { STEP_METERS } from '../../src/core/types.ts'

/** Un degré de longitude ≈ 78 km à cette latitude ; on raisonne en mètres. */
const LAT = 45.4
const M = 1 / 111_195 // un mètre en degrés de latitude

/** Chemin rectiligne vers le nord, de `meters` mètres, à partir de `startNorth`. */
function way(id: number, startNorth: number, meters: number): TrailWay {
  return {
    osmWayId: id,
    coords: [
      [4.5, LAT + startNorth * M],
      [4.5, LAT + (startNorth + meters) * M],
    ],
  }
}

function itinerary(ways: TrailWay[], totalMeters: number): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways,
    totalMeters,
    fetchedAt: '2026-08-20T00:00:00Z',
  }
}

/** Échantillons régulièrement espacés le long d'un chemin, comme buildSamples. */
function samplesFor(
  wayId: number,
  startNorth: number,
  meters: number,
  done: (index: number) => boolean = () => false,
): Sample[] {
  const total = Math.floor(meters / STEP_METERS)
  return Array.from({ length: total }, (_, i) => ({
    lon: 4.5,
    lat: LAT + (startNorth + i * STEP_METERS) * M,
    wayId,
    itineraryIds: [1],
    done: done(i),
  }))
}

describe('buildStages', () => {
  it('ne découpe pas un itinéraire court : une étape unique n’apprend rien', () => {
    const court = itinerary([way(10, 0, 10_000)], 10_000)
    expect(buildStages(court, samplesFor(10, 0, 10_000))).toEqual([])
    expect(MIN_STAGED_METERS).toBeGreaterThan(DEFAULT_STAGE_METERS)
  })

  it('découpe un long itinéraire en étapes de la longueur demandée', () => {
    const long = itinerary([way(10, 0, 60_000)], 60_000)
    const etapes = buildStages(long, samplesFor(10, 0, 60_000), {
      stageMeters: 20_000,
    })
    expect(etapes).toHaveLength(3)
    expect(etapes[0]?.index).toBe(1)
    expect(etapes[0]?.meters).toBe(20_000)
    expect(etapes[2]?.endMeters).toBe(60_000)
  })

  it('donne la progression de chaque étape', () => {
    // Seule la deuxième étape est parcourue : 0 %, 100 %, 0 %.
    const long = itinerary([way(10, 0, 60_000)], 60_000)
    const echantillons = samplesFor(10, 0, 60_000, (i) => i >= 200 && i < 400)
    const etapes = buildStages(long, echantillons, { stageMeters: 20_000 })
    expect(etapes.map((e) => Math.round(e.pct))).toEqual([0, 100, 0])
    expect(etapes[1]?.doneMeters).toBe(20_000)
  })

  it('rattache un reliquat trop court à l’étape précédente', () => {
    // 62 km en étapes de 20 : trois étapes, pas trois plus un bout de 2 km
    // qu'on ne ferait jamais en une sortie.
    const long = itinerary([way(10, 0, 62_000)], 62_000)
    const etapes = buildStages(long, samplesFor(10, 0, 62_000), {
      stageMeters: 20_000,
    })
    expect(etapes).toHaveLength(3)
    expect(etapes[2]?.meters).toBe(22_000)
  })

  it('remet les tronçons dans l’ordre du chemin', () => {
    // Les membres d'une relation OSM ne sont pas toujours dans l'ordre :
    // sans remise en ordre, les étapes sauteraient d'un bout à l'autre.
    const desordre = itinerary(
      [way(30, 40_000, 20_000), way(10, 0, 20_000), way(20, 20_000, 20_000)],
      60_000,
    )
    const echantillons = [
      ...samplesFor(30, 40_000, 20_000),
      ...samplesFor(10, 0, 20_000),
      ...samplesFor(20, 20_000, 20_000),
    ]
    const etapes = buildStages(desordre, echantillons, { stageMeters: 20_000 })
    expect(etapes).toHaveLength(3)
    // Le sens de parcours suit l'ordre des membres de la relation (convention
    // OSM) ; ce qui compte ici, c'est que les étapes s'enchaînent au lieu de
    // sauter d'un bout à l'autre du tracé.
    for (let i = 1; i < etapes.length; i++) {
      const precedente = etapes[i - 1] as { end: LonLat }
      const courante = etapes[i] as { start: LonLat }
      expect(distanceMeters(precedente.end, courante.start)).toBeLessThan(
        1.5 * STEP_METERS,
      )
    }
  })

  it('retourne le tracé à l’envers quand il est décrit dans l’autre sens', () => {
    const inverse: TrailWay = {
      osmWayId: 20,
      coords: [
        [4.5, LAT + 40_000 * M],
        [4.5, LAT + 20_000 * M],
      ],
    }
    const mixte = itinerary(
      [way(10, 0, 20_000), inverse, way(30, 40_000, 20_000)],
      60_000,
    )
    const echantillons = [
      ...samplesFor(10, 0, 20_000),
      ...samplesFor(20, 20_000, 20_000).reverse(),
      ...samplesFor(30, 40_000, 20_000),
    ]
    const etapes = buildStages(mixte, echantillons, { stageMeters: 20_000 })
    expect(etapes).toHaveLength(3)
    // Chaque étape reprend là où la précédente s'arrête, à un échantillon
    // près — sans la remise à l'endroit, l'écart serait de 20 km.
    for (let i = 1; i < etapes.length; i++) {
      const precedente = etapes[i - 1] as { end: LonLat }
      const courante = etapes[i] as { start: LonLat }
      expect(distanceMeters(precedente.end, courante.start)).toBeLessThan(
        1.5 * STEP_METERS,
      )
    }
  })

  it('ignore les échantillons des autres itinéraires', () => {
    const long = itinerary([way(10, 0, 60_000)], 60_000)
    const partages = samplesFor(10, 0, 60_000).map((s, i) => ({
      ...s,
      itineraryIds: i < 200 ? [1, 2] : [2],
    }))
    const etapes = buildStages(long, partages, { stageMeters: 20_000 })
    // Seuls les 20 premiers kilomètres appartiennent à cet itinéraire.
    expect(etapes).toEqual([])
  })

  it('gère un itinéraire sans échantillon', () => {
    expect(buildStages(itinerary([way(10, 0, 60_000)], 60_000), [])).toEqual([])
  })

  it('couvre tout le tracé même quand les tronçons ne se touchent pas', () => {
    // Deux morceaux séparés (relation incomplète dans OSM) : on ne perd
    // aucun kilomètre, on les enchaîne dans l'ordre donné.
    const troue = itinerary([way(10, 0, 30_000), way(20, 60_000, 30_000)], 60_000)
    const etapes = buildStages(
      troue,
      [...samplesFor(10, 0, 30_000), ...samplesFor(20, 60_000, 30_000)],
      { stageMeters: 20_000 },
    )
    const total = etapes.reduce((n, e) => n + e.meters, 0)
    expect(total).toBe(60_000)
  })

  it('expose un cadre de zoom pour chaque étape', () => {
    const long = itinerary([way(10, 0, 60_000)], 60_000)
    const etapes = buildStages(long, samplesFor(10, 0, 60_000), {
      stageMeters: 20_000,
    })
    const [sudOuest, nordEst] = etapes[0]?.bounds as [LonLat, LonLat]
    expect(sudOuest[1]).toBeLessThan(nordEst[1])
  })
})
