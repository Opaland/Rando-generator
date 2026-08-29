import { describe, it, expect } from 'vitest'
import {
  STALE_DAYS,
  assessItinerary,
  hasGaps,
} from '../../src/core/dataQuality.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'
import type { Itinerary, LonLat, TrailWay } from '../../src/core/types.ts'

const LAT = 45.4

function way(id: number, from: number, to: number): TrailWay {
  const coords: LonLat[] = [
    [4.5 + from / 78, LAT],
    [4.5 + to / 78, LAT],
  ]
  return { osmWayId: id, coords }
}

function itinerary(ways: TrailWay[], patch: Partial<Itinerary> = {}): Itinerary {
  return {
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways,
    totalMeters: 20_000,
    fetchedAt: '2026-08-20T00:00:00Z',
    ...patch,
  }
}

const MAINTENANT = '2026-08-20T12:00:00Z'

describe('assessItinerary', () => {
  it('ne signale rien sur une relation continue et fraîche', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 10, 20)]),
      MAINTENANT,
    )
    expect(bilan.pieces).toBe(1)
    expect(bilan.gaps).toEqual([])
    expect(bilan.warnings).toEqual([])
  })

  it('compte les morceaux et mesure les interruptions', () => {
    // Deux tronçons séparés de 10 km : la relation est trouée dans OSM, et le
    // pourcentage ne porte que sur ce qui est présent.
    const bilan = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 20, 30)]),
      MAINTENANT,
    )
    expect(bilan.pieces).toBe(2)
    expect(bilan.gaps).toHaveLength(1)
    expect(bilan.gapMeters).toBeGreaterThan(9_000)
    expect(bilan.gapMeters).toBeLessThan(11_000)
    expect(bilan.warnings.join()).toMatch(/2 morceaux/)
  })

  it('classe les interruptions de la plus grande à la plus petite', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 5), way(2, 10, 15), way(3, 40, 45)]),
      MAINTENANT,
    )
    expect(bilan.gaps).toHaveLength(2)
    expect(bilan.gaps[0]?.meters).toBeGreaterThan(bilan.gaps[1]?.meters ?? 0)
  })

  it('signale des données anciennes', () => {
    const vieux = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: '2026-06-01T00:00:00Z' }),
      MAINTENANT,
    )
    expect(vieux.ageDays).toBeGreaterThan(STALE_DAYS)
    expect(vieux.warnings.join()).toMatch(/téléchargé/i)
  })

  it('ne signale pas un âge qu’il ne connaît pas', () => {
    const bilan = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: 'pas une date' }),
      MAINTENANT,
    )
    expect(bilan.ageDays).toBeNull()
    expect(bilan.warnings.join()).not.toMatch(/téléchargé/i)
  })

  it('signale une relation sans géométrie exploitable', () => {
    const vide = assessItinerary(itinerary([]), MAINTENANT)
    expect(vide.pieces).toBe(0)
    expect(vide.warnings.join()).toMatch(/aucun tracé/i)
  })

  it('ne retient que les trous de géométrie pour la liste', () => {
    // L'âge de la donnée concerne toute la zone d'un coup : répété sur chaque
    // ligne de la liste, il n'apprendrait rien.
    const vieuxMaisContinu = assessItinerary(
      itinerary([way(1, 0, 20)], { fetchedAt: '2026-06-01T00:00:00Z' }),
      MAINTENANT,
    )
    expect(vieuxMaisContinu.warnings).not.toEqual([])
    expect(hasGaps(vieuxMaisContinu)).toBe(false)

    const troue = assessItinerary(
      itinerary([way(1, 0, 10), way(2, 20, 30)]),
      MAINTENANT,
    )
    expect(hasGaps(troue)).toBe(true)
  })

  it('ne compte pas un chemin fermé comme une interruption', () => {
    // Une boucle : le dernier tronçon revient sur le premier point.
    const carre: TrailWay = {
      osmWayId: 9,
      coords: [
        [4.5, LAT],
        [4.51, LAT],
        [4.51, LAT + 0.01],
        [4.5, LAT],
      ],
    }
    const bilan = assessItinerary(itinerary([carre]), MAINTENANT)
    expect(bilan.pieces).toBe(1)
    expect(bilan.warnings).toEqual([])
  })
})

describe('fraîcheur amont', () => {
  const relation = (osmUpdatedAt: string | null): Itinerary => ({
    osmRelationId: 1,
    ref: 'GR 7',
    name: null,
    network: 'GR',
    ways: [
      {
        osmWayId: 10,
        coords: [
          [4.5, 45.4],
          [4.51, 45.4],
        ],
      },
    ],
    totalMeters: 800,
    fetchedAt: '2026-08-20T00:00:00Z',
    osmUpdatedAt,
  })

  it('compte l’âge de la donnée elle-même, pas celui de notre copie', () => {
    const qualite = assessItinerary(
      relation('2019-04-02T08:15:00Z'),
      '2026-08-20T00:00:00Z',
    )
    expect(qualite.upstreamAgeDays).toBe(2696)
    // Ancien n'est pas faux : un GR stable ne bouge pas. Rien à signaler.
    expect(qualite.warnings.join(' ')).not.toMatch(/OpenStreetMap le/)
  })

  it('rend null quand la date amont est absente ou illisible', () => {
    expect(assessItinerary(relation(null), '2026-08-20T00:00:00Z').upstreamAgeDays).toBeNull()
    expect(
      assessItinerary(relation('pas une date'), '2026-08-20T00:00:00Z')
        .upstreamAgeDays,
    ).toBeNull()
  })

  it('ne compte pas d’âge négatif si l’horloge locale retarde', () => {
    const qualite = assessItinerary(
      relation('2026-08-25T00:00:00Z'),
      '2026-08-20T00:00:00Z',
    )
    expect(qualite.upstreamAgeDays).toBe(0)
  })
})

/**
 * La relation d'un seul chemin (issue #301).
 *
 * ## Le cas réel
 *
 * « Rando Saint-Joseph », relation OSM 6628093 : `route=hiking`, un unique
 * chemin membre de 471 m, ni `ref` ni `network`, version 2, pas retouchée
 * depuis 2016. Elle est présentée à côté d'un GR de 153 km, et **Sentiers
 * ne se trompe pas** — les 0,5 km affichés sont toute la géométrie qu'elle
 * contient. C'est la donnée qui est incomplète.
 *
 * ## Pourquoi une phrase et pas un filtre
 *
 * Écarter en deçà d'une longueur demanderait un seuil, et le §2 l'interdit
 * tant qu'on n'a pas regardé la distribution. Le signal « un seul chemin
 * membre » est **structurel** : il ne demande aucun nombre choisi.
 *
 * ## Ce que la mesure a autorisé
 *
 * L'issue posait un verrou : « si c'est 20 %, la phrase apparaîtra partout
 * et deviendra du bruit ». Mesuré le 29/08 sur 26 relations du Pilat, de la
 * Loire et de l'ouest lyonnais, lues une à une sur `api.openstreetmap.org` :
 * **une seule, soit 4 %**. La valeur suivante dans la distribution est 3
 * chemins — le cas est un point isolé, pas le bas d'un continuum.
 *
 * Réserve écrite dans l'issue : une seule région, et l'échantillon vient de
 * cinq emprises sur huit. Assez pour écarter « 20 % », pas pour affirmer
 * « 4 % en France ».
 */
describe('la relation d’un seul chemin se dit', () => {
  const UN_CHEMIN = [{ osmWayId: 1, coords: straightLine(4.5, 45.4, 471, 30) }]

  it('le signale quand la relation n’a qu’un chemin', () => {
    const q = assessItinerary(
      makeItinerary(6628093, UN_CHEMIN, { network: 'INCONNU', ref: null }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).toContain('un seul chemin')
  })

  /*
    Deux chemins : rien à signaler. Sans ce cas, un avertissement rendu
    inconditionnellement passerait le test précédent.
  */
  it('ne dit rien d’une relation à deux chemins', () => {
    const deux = [
      { osmWayId: 1, coords: straightLine(4.5, 45.4, 500, 20) },
      { osmWayId: 2, coords: straightLine(4.51, 45.4, 500, 20) },
    ]
    const q = assessItinerary(
      makeItinerary(2, deux, { network: 'GR' }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).not.toContain('un seul chemin')
  })

  /*
    Et surtout : la phrase ne prétend pas que le pourcentage est faux.

    C'est ce qui la distingue de l'avertissement « géométrie en morceaux ».
    Ici tout ce que la relation contient est mesuré correctement ; ce qui
    manque manque **dans OpenStreetMap**, et personne ne peut le savoir
    depuis nos données. Dire « probablement incomplète » est le maximum
    qu'on puisse affirmer — et le §2 interdit d'affirmer plus.
  */
  it('reste au conditionnel : elle ne condamne pas le pourcentage', () => {
    const q = assessItinerary(
      makeItinerary(6628093, UN_CHEMIN, { network: 'INCONNU', ref: null }),
      '2026-08-29T00:00:00Z',
    )
    const phrase = q.warnings.find((a) => a.includes('un seul chemin')) ?? ''
    expect(phrase).toContain('probablement')
    expect(phrase).not.toContain('ne veut rien dire')
  })

  /*
    Un itinéraire qui **déclare** quelque chose n'est pas un fragment.

    L'issue le disait — « une liaison assumée porterait un `ref` ou un
    `network` » — et je l'avais laissé tomber en écrivant le code. C'est
    `qualite.spec.ts` qui l'a rattrapé : la fixture modélise le GRP Tour du
    Pilat, 140 km réels, par un chemin unique, et l'avertissement s'affichait
    sur un itinéraire manifestement déclaré.

    Le raccourci de fixture était le révélateur, pas la cause. Sans ce
    garde-fou, n'importe quel GR sommairement cartographié aurait été traité
    de fragment — et c'est le genre d'erreur qui décrédibilise toutes les
    autres notes de la fiche.

    Les deux relations réelles mesurées n'ont ni `ref` ni `network`.
  */
  it('ne dit rien d’un itinéraire qui porte une référence', () => {
    const q = assessItinerary(
      makeItinerary(1003, UN_CHEMIN, {
        network: 'GRP',
        ref: 'GRP Tour du Pilat',
      }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).not.toContain('un seul chemin')
  })

  it('ne dit rien d’un itinéraire d’un réseau déclaré', () => {
    const q = assessItinerary(
      makeItinerary(1004, UN_CHEMIN, { network: 'PR', ref: null }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).not.toContain('un seul chemin')
  })

  /*
    Un chemin unique **fermé** est une boucle complète, pas un fragment.

    Ce cas n'est pas de moi : `dataQuality.test.ts` avait déjà « ne compte
    pas un chemin fermé comme une interruption », et il a rougi sur ma
    première version — qui ne regardait que le nombre de chemins. Il avait
    raison : une boucle communale est exactement ça, un seul chemin qui
    revient sur lui-même, et la dire « probablement incomplète » aurait été
    faux.

    Il est réécrit ici, dans le vocabulaire de #301, parce qu'un test ne
    s'appuie pas sur son voisin (§4bis) : celui d'origine parle
    d'interruptions, pas de complétude, et il pourrait changer de raison
    sans que celui-ci s'en aperçoive.

    Vérifié sur les deux cas réels : les chemins de « Rando Saint-Joseph »
    et du « Circuit de la Ronde des Vergers » sont tous deux **ouverts**.
    L'exclusion n'entame donc pas la mesure de 4 %.
  */
  it('ne dit rien d’une boucle faite d’un seul chemin fermé', () => {
    const boucle = [
      {
        osmWayId: 7,
        coords: [
          [4.5, 45.4],
          [4.51, 45.4],
          [4.51, 45.41],
          [4.5, 45.4],
        ] as [number, number][],
      },
    ]
    const q = assessItinerary(
      makeItinerary(7, boucle, { network: 'INCONNU', ref: null }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).not.toContain('un seul chemin')
  })

  /*
    Une relation vide n'a pas « un seul chemin » : elle n'en a aucun, et
    l'avertissement existant dit déjà que le pourcentage ne veut rien dire.
    Deux phrases sur le même écran diraient deux choses différentes du même
    fait.
  */
  it('n’ajoute rien à une relation sans aucun tracé', () => {
    const q = assessItinerary(
      makeItinerary(3, [], { network: 'INCONNU' }),
      '2026-08-29T00:00:00Z',
    )
    expect(q.warnings.join(' ')).not.toContain('un seul chemin')
  })
})
