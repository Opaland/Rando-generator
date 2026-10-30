import { describe, it, expect } from 'vitest'
import contoursEmbarques from '../../public/data/contours-de-zone.json' with { type: 'json' }
import {
  dansLePolygone,
  lieuxDeLaTrace,
  POINTS_EXAMINES_PAR_TRACE,
  type ContoursDeZone,
  type ZoneAContour,
} from '../../src/core/lieuxDeTrace.ts'
import { ZONES } from '../../src/core/overpass.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #296 — Karim tape « Pilat », et ses fichiers s'appellent
 * `activity_18274639.gpx`. #206 indexe la zone chargée **au moment de
 * l'import** ; restaient les traces importées avant, ou hors de toute zone.
 * Tranché par Cédric le 22/10 : les contours des zones prédéfinies,
 * simplifiés à ~100 m, embarqués.
 */

const carre = (o: number, s: number, cote: number): LonLat[] => [
  [o, s],
  [o + cote, s],
  [o + cote, s + cote],
  [o, s + cote],
  [o, s],
]

describe('dansLePolygone', () => {
  it('distingue le dedans du dehors', () => {
    expect(dansLePolygone([0.5, 0.5], [carre(0, 0, 1)])).toBe(true)
    expect(dansLePolygone([1.5, 0.5], [carre(0, 0, 1)])).toBe(false)
    expect(dansLePolygone([0.5, -0.1], [carre(0, 0, 1)])).toBe(false)
  })

  it('un trou n’est pas dedans', () => {
    // Une enclave : la Métropole de Lyon est un trou du Rhône, par exemple.
    const avecTrou = [carre(0, 0, 4), carre(1, 1, 2)]
    expect(dansLePolygone([2, 2], avecTrou)).toBe(false)
    expect(dansLePolygone([0.5, 0.5], avecTrou)).toBe(true)
  })

  it('suit un contour concave', () => {
    // Un « U » ouvert vers le haut : le creux est dehors.
    const u: LonLat[] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
      [0, 0],
    ]
    expect(dansLePolygone([1.5, 2], [u])).toBe(false)
    expect(dansLePolygone([0.5, 2], [u])).toBe(true)
    expect(dansLePolygone([2.5, 2], [u])).toBe(true)
  })
})

const ZONES_FICTIVES: ZoneAContour[] = [
  { label: 'Massif A', areaSelectors: ['selA'] },
  { label: 'Massif B', areaSelectors: ['selB'] },
  { label: 'A et B', areaSelectors: ['selA', 'selB'] },
]
const CONTOURS_FICTIFS: ContoursDeZone = {
  seuilDegres: 0.001,
  contours: {
    selA: { relation: 1, polygones: [[carre(0, 0, 1)]] },
    selB: { relation: 2, polygones: [[carre(1, 0, 1)]] },
  },
}

describe('lieuxDeLaTrace', () => {
  it('nomme la zone où tombe la trace', () => {
    const trace: LonLat[] = [
      [0.2, 0.5],
      [0.4, 0.5],
    ]
    expect(lieuxDeLaTrace(trace, CONTOURS_FICTIFS, ZONES_FICTIVES)).toEqual(['Massif A'])
  })

  it('ne nomme pas une zone faite d’autres zones', () => {
    /*
      Relecture adverse du 30/10 : « Rhône, Loire et Pilat » réunit trois
      zones. La nommer collait le mot « Pilat » à toute sortie de Roanne ou
      de Lyon, et « pilat » les retrouvait toutes. Ses parties sont déjà
      nommées : la composite n'ajoute que des mots faux.
    */
    const dansA: LonLat[] = [[0.5, 0.5]]
    expect(lieuxDeLaTrace(dansA, CONTOURS_FICTIFS, ZONES_FICTIVES)).not.toContain('A et B')
  })

  it('nomme les deux zones d’une trace qui passe de l’une à l’autre', () => {
    const trace: LonLat[] = [
      [0.5, 0.5],
      [1.5, 0.5],
    ]
    expect(lieuxDeLaTrace(trace, CONTOURS_FICTIFS, ZONES_FICTIVES)).toEqual([
      'Massif A',
      'Massif B',
    ])
  })

  it('ne nomme rien hors de toute zone, ni pour une trace vide', () => {
    expect(lieuxDeLaTrace([[5, 5]], CONTOURS_FICTIFS, ZONES_FICTIVES)).toEqual([])
    expect(lieuxDeLaTrace([], CONTOURS_FICTIFS, ZONES_FICTIVES)).toEqual([])
  })

  it('ne nomme pas une zone dont le contour manque', () => {
    const zones: ZoneAContour[] = [{ label: 'Sans contour', areaSelectors: ['selC'] }]
    expect(lieuxDeLaTrace([[0.5, 0.5]], CONTOURS_FICTIFS, zones)).toEqual([])
  })

  it('examine la fin d’une longue trace, pas seulement son début', () => {
    // Mille points dehors, puis l'arrivée dans B : un échantillon qui
    // s'arrêterait avant la fin la manquerait.
    const trace: LonLat[] = [
      ...Array.from({ length: 1_000 }, (_, i): LonLat => [5 + i * 1e-4, 5]),
      [1.5, 0.5],
    ]
    expect(trace.length).toBeGreaterThan(POINTS_EXAMINES_PAR_TRACE)
    expect(lieuxDeLaTrace(trace, CONTOURS_FICTIFS, ZONES_FICTIVES)).toEqual(['Massif B'])
  })
})

describe('les contours embarqués (public/data/contours-de-zone.json)', () => {
  const fichier = contoursEmbarques as unknown as ContoursDeZone

  it('couvrent chaque sélecteur de chaque zone prédéfinie', () => {
    // Le fichier est généré depuis `ZONES` : une zone ajoutée sans relancer
    // le script ne serait jamais retrouvée, et rien ne le dirait (§4ter).
    const manquants = ZONES.flatMap((z) => z.areaSelectors).filter(
      (s) => !(s in fichier.contours),
    )
    expect(manquants).toEqual([])
  })

  it('ne recalculent pas une trace déjà rangée, sans se mêler d’une autre liste de zones', () => {
    // L'historique se recalcule à chaque import : seules les traces neuves
    // doivent repasser au point-dans-polygone (relecture du 30/10).
    const points: LonLat[] = [[4.6829, 45.4192]]
    const premier = lieuxDeLaTrace(points, fichier)
    expect(lieuxDeLaTrace(points, fichier)).toBe(premier)
    // Mêmes points, autres zones : pas la réponse gardée pour `ZONES`.
    expect(lieuxDeLaTrace(points, fichier, [])).toEqual([])
  })

  it('sont au seuil tranché le 22/10 : 0,001°, ~100 m', () => {
    expect(fichier.seuilDegres).toBe(0.001)
  })

  it('rangent des lieux connus dans leurs zones', () => {
    // Pélussin, dans le Pilat et dans la Loire ; Grenoble ; Nouméa.
    expect(lieuxDeLaTrace([[4.6829, 45.4192]], fichier)).toEqual(['Loire', 'PNR du Pilat'])
    // Roanne, dans la Loire et loin du Pilat : « pilat » ne doit pas la
    // retrouver (relecture adverse du 30/10).
    expect(lieuxDeLaTrace([[4.0726, 46.0342]], fichier)).toEqual(['Loire'])
    expect(lieuxDeLaTrace([[5.7245, 45.1885]], fichier)).toEqual(['Isère'])
    expect(lieuxDeLaTrace([[166.4572, -22.2758]], fichier)).toEqual([
      'Nouvelle-Calédonie',
    ])
    // Lyon : dans la Métropole, donc dans la zone « Rhône + Métropole ».
    expect(lieuxDeLaTrace([[4.8357, 45.764]], fichier)).toEqual([
      'Rhône + Métropole de Lyon',
    ])
    // Paris : aucune zone prédéfinie.
    expect(lieuxDeLaTrace([[2.3522, 48.8566]], fichier)).toEqual([])
  })
})
