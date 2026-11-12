import { describe, it, expect } from 'vitest'
import { anneesDeSorties, faitsDeSaison } from '../../src/core/faitsDeSaison.ts'
import type { ContoursDeZone } from '../../src/core/lieuxDeTrace.ts'
import type { LonLat, Track } from '../../src/core/types.ts'

/**
 * Issue #673 — les faits d'un bilan de saison, calculés ici et nulle part
 * ailleurs : Claude n'en écrit que le texte. Ce qui part chez Anthropic est
 * exactement cet objet, et rien d'autre. Ces tests disent donc aussi ce qui
 * **ne** part **pas** : ni coordonnées, ni nom de fichier, ni date précise.
 */

// Une ligne droite vers l'est : ~1,11 km par centième de degré à l'équateur,
// assez pour comparer des longueurs sans recompter la géodésie.
function trace(
  id: string,
  date: string | null,
  centiemes: number,
  elevationGain: number | null = null,
  depart: LonLat = [0, 0],
): Track {
  const points: LonLat[] = Array.from({ length: centiemes + 1 }, (_, i) => [
    depart[0] + i * 0.01,
    depart[1],
  ])
  return {
    id,
    filename: `activity_${id}.gpx`,
    points,
    date,
    importedAt: '2026-11-11T08:00:00Z',
    elevationGain,
  }
}

describe('anneesDeSorties', () => {
  it('rend les années datées, de la plus récente à la plus ancienne, sans doublon', () => {
    const traces = [
      trace('a', '2025-05-01T09:00:00Z', 1),
      trace('b', '2026-06-01T09:00:00Z', 1),
      trace('c', '2026-07-01T09:00:00Z', 1),
      trace('d', null, 1),
    ]
    expect(anneesDeSorties(traces)).toEqual([2026, 2025])
  })
})

describe('faitsDeSaison', () => {
  const traces = [
    trace('a', '2026-06-02T09:00:00Z', 10, 400),
    trace('b', '2026-06-20T09:00:00Z', 20, 900),
    trace('c', '2026-09-05T09:00:00Z', 5, null),
    trace('d', '2025-08-01T09:00:00Z', 30, 1200),
    trace('e', null, 50, 3000),
  ]

  it('compte les sorties de l’année, et seulement elles', () => {
    const faits = faitsDeSaison(traces, 2026)
    expect(faits?.annee).toBe(2026)
    expect(faits?.sorties).toBe(3)
    expect(faits?.moisActifs).toBe(2)
  })

  it('arrondit les kilomètres au dixième et le dénivelé au mètre', () => {
    const faits = faitsDeSaison(traces, 2026)
    // 35 centièmes de degré à l'équateur : ~38,9 km.
    expect(faits?.km).toBeCloseTo(38.9, 1)
    expect(Number.isInteger((faits?.km ?? 0) * 10)).toBe(true)
    expect(faits?.deniveleM).toBe(1300)
  })

  it('nomme le mois le plus parcouru, en toutes lettres', () => {
    const faits = faitsDeSaison(traces, 2026)
    expect(faits?.moisLePlusParcouru).toEqual({ mois: 'juin', sorties: 2, km: expect.closeTo(33.4, 1) as number })
  })

  it('donne la plus longue sortie et le plus gros dénivelé', () => {
    const faits = faitsDeSaison(traces, 2026)
    expect(faits?.plusLongueSortieKm).toBeCloseTo(22.2, 1)
    expect(faits?.plusGrosDeniveleM).toBe(900)
  })

  it('ne donne pas de dénivelé quand aucune sortie de l’année n’en porte', () => {
    // Un zéro serait un chiffre présenté comme une mesure (§2).
    const faits = faitsDeSaison([trace('c', '2026-09-05T09:00:00Z', 5, null)], 2026)
    expect(faits?.deniveleM).toBeNull()
    expect(faits?.plusGrosDeniveleM).toBeNull()
  })

  it('compare à l’année précédente quand elle existe', () => {
    expect(faitsDeSaison(traces, 2026)?.anneePrecedente).toEqual({
      annee: 2025,
      sorties: 1,
      km: expect.closeTo(33.4, 1) as number,
    })
    expect(faitsDeSaison(traces, 2025)?.anneePrecedente).toBeNull()
  })

  it('rend null pour une année sans sortie', () => {
    expect(faitsDeSaison(traces, 2020)).toBeNull()
  })

  it('nomme les zones traversées par leurs noms publics, jamais par des coordonnées', () => {
    const contours: ContoursDeZone = {
      seuilDegres: 0.001,
      contours: {
        sel: {
          relation: 1,
          polygones: [
            [
              [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
                [-1, -1],
              ],
            ],
          ],
        },
      },
    }
    const zones = [{ label: 'Massif fictif', areaSelectors: ['sel'] }]
    const faits = faitsDeSaison(traces, 2026, contours, zones)
    expect(faits?.zones).toEqual([{ nom: 'Massif fictif', sorties: 3 }])
  })

  it('n’emporte ni coordonnées, ni nom de fichier, ni date précise', () => {
    const texte = JSON.stringify(faitsDeSaison(traces, 2026))
    expect(texte).not.toMatch(/activity_|\.gpx/)
    expect(texte).not.toMatch(/2026-0\d-\d\d|T09:00/)
    expect(texte).not.toMatch(/points|\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/)
  })
})
