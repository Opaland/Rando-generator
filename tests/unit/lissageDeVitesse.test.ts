import { describe, it, expect } from 'vitest'
import { windowedSpeedMps } from '../../src/core/matching.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * La vitesse lissée d'un segment, sur des valeurs calculées à la main.
 *
 * C'est elle qui décide si un segment est une marche ou un trajet motorisé
 * (#150) — donc ce que la trace retire du calcul. Jusqu'au 18/10, elle
 * n'était éprouvée qu'à travers `runMatching`, sur un trajet en voiture
 * rapide de bout en bout : une borne de fenêtre décalée d'un point, un
 * balayage dans le mauvais sens, une durée nulle rendue infinie, rien de
 * cela ne changeait le résultat. Une cinquantaine de mutants y survivaient.
 *
 * Chaque cas pose des points dont on sait d'avance lesquels la fenêtre de
 * ±60 s doit retenir, et compare à la vitesse recalculée sur ces seuls
 * points — jamais à un nombre recopié.
 */

/** Des points en ligne vers l'est, `metres[k]` étant la longueur du segment k+1. */
function points(metres: number[]): LonLat[] {
  const sortie: LonLat[] = [[4.5, 45.4]]
  for (const m of metres) {
    const [lon, lat] = sortie[sortie.length - 1] as LonLat
    sortie.push([lon + m / 78_710, lat])
  }
  return sortie
}

/** Des horodatages, `secondes[k]` étant la durée du segment k+1. */
function temps(secondes: number[], depart = 0): number[] {
  const sortie = [depart]
  for (const s of secondes) sortie.push((sortie[sortie.length - 1] as number) + s * 1000)
  return sortie
}

/** La vitesse attendue si la fenêtre retient les points `lo` à `hi`. */
function vitesseEntre(p: LonLat[], t: number[], lo: number, hi: number): number {
  let d = 0
  for (let k = lo + 1; k <= hi; k++) d += distanceMeters(p[k - 1] as LonLat, p[k] as LonLat)
  return d / (((t[hi] as number) - (t[lo] as number)) / 1000)
}

const vingt = (m: number) => Array.from({ length: 20 }, () => m)

describe('windowedSpeedMps — la fenêtre de ±60 s', () => {
  /*
    Vingt segments de 13 m en 10 s, sauf le dixième : 200 m en 10 s. Pour ce
    segment-là (points 9 → 10, tB = 100 s, tA = 90 s), la fenêtre retient
    vers l'arrière les points jusqu'à tB − 60 = 40 s compris (point 4), et
    vers l'avant jusqu'à tA + 60 = 150 s compris (point 15).
  */
  const metres = vingt(13).map((m, k) => (k === 9 ? 200 : m))
  const p = points(metres)
  const t = temps(vingt(10))

  it('lisse un saut isolé sur la fenêtre entière, bornes comprises', () => {
    const v = windowedSpeedMps(p, t, 10)
    expect(v).toBeCloseTo(vitesseEntre(p, t, 4, 15), 9)
    // Et ce n'est pas la vitesse du seul saut : 20 m/s, motorisé.
    expect(v).toBeLessThan(4)
  })

  it('s’arrête au bord gauche du tableau', () => {
    expect(windowedSpeedMps(p, t, 1)).toBeCloseTo(vitesseEntre(p, t, 0, 7), 9)
  })

  it('s’arrête au bord droit du tableau', () => {
    expect(windowedSpeedMps(p, t, 20)).toBeCloseTo(vitesseEntre(p, t, 13, 20), 9)
  })
})

describe('windowedSpeedMps — ce qui interrompt la fenêtre', () => {
  /*
    Des segments de longueurs toutes différentes : à vitesse uniforme, toutes
    les fenêtres rendent la même vitesse, et une borne fausse ne se voit pas.
    La première version de ce bloc prenait vingt fois 13 m, et deux de ses
    tests ne pouvaient pas échouer (vu à l'injection).
  */
  const p = points(Array.from({ length: 20 }, (_, k) => 5 + k * k))

  it('rend null si l’un des deux points du segment n’a pas d’heure', () => {
    const t: (number | null)[] = temps(vingt(10))
    expect(windowedSpeedMps(p, t.map((x, k) => (k === 9 ? null : x)), 10)).toBeNull()
    expect(windowedSpeedMps(p, t.map((x, k) => (k === 10 ? null : x)), 10)).toBeNull()
  })

  it('s’arrête à un point sans heure, de chaque côté', () => {
    const t: (number | null)[] = temps(vingt(10)).map((x, k) =>
      k === 6 || k === 13 ? null : x,
    )
    expect(windowedSpeedMps(p, t, 10)).toBeCloseTo(
      vitesseEntre(p, t as number[], 7, 12),
      9,
    )
  })

  /*
    Les deux suivants près du départ, et ce n'est pas un détail. Sans le
    `== null`, JavaScript lit `null` comme 0 : `tB − null` vaut `tB`, qui
    dépasse la fenêtre dès que la trace a plus d'une minute — la garde
    paraissait inutile parce que mes premiers cas tombaient tous là. Elle ne
    l'est que dans la première minute (vu à l'injection, 18/10).
  */
  it('s’arrête à un point sans heure dans la première minute, vers l’arrière', () => {
    const t: (number | null)[] = temps(vingt(10)).map((x, k) => (k === 1 ? null : x))
    expect(windowedSpeedMps(p, t, 4)).toBeCloseTo(vitesseEntre(p, t as number[], 2, 9), 9)
  })

  it('s’arrête à un point sans heure quand le segment part de zéro, vers l’avant', () => {
    const t: (number | null)[] = temps(vingt(10)).map((x, k) => (k === 3 ? null : x))
    expect(windowedSpeedMps(p, t, 1)).toBeCloseTo(vitesseEntre(p, t as number[], 0, 2), 9)
  })

  /*
    Trois points de suite à la même heure : un rééchantillonnage en produit
    (jusqu'à 61 % de paires identiques sur une sortie du corpus,
    docs/MESURE_VITESSE_25_08.md). Un voisin à la même heure que le segment
    est dans la fenêtre, pas au-delà — le balayage doit le traverser.
  */
  it('traverse vers l’arrière un voisin à la même heure que le segment', () => {
    const t = temps(vingt(10))
    t[8] = t[10] as number
    t[9] = t[10] as number
    // tA = tB = 100 s : la fenêtre avant va donc jusqu'à 160 s (point 16).
    expect(windowedSpeedMps(p, t, 10)).toBeCloseTo(vitesseEntre(p, t, 4, 16), 9)
  })

  it('traverse vers l’avant un voisin à la même heure que le segment', () => {
    const t = temps(vingt(10))
    t[10] = t[9] as number
    t[11] = t[9] as number
    expect(windowedSpeedMps(p, t, 10)).toBeCloseTo(vitesseEntre(p, t, 3, 15), 9)
  })

  it('rend null quand la fenêtre ne dure rien', () => {
    // Deux points au même instant, leurs voisins à plus d'une minute : une
    // paire dupliquée par un rééchantillonnage, qu'on ne peut pas juger.
    const q = points([10, 10, 10])
    const t = [0, 1_000_000, 1_000_000, 2_000_000]
    expect(windowedSpeedMps(q, t, 2)).toBeNull()
  })
})

describe('windowedSpeedMps — deux sorties dont l’heure recule (#539)', () => {
  /*
    Une première sortie de 0 à 200 s, puis une seconde qui repart de 0,
    onze kilomètres plus loin. Ni l'une ni l'autre ne doit compter dans la
    fenêtre de l'autre : leurs heures ne sont pas comparables.
  */
  const a = points(vingt(13))
  const b = points(vingt(13)).map(([lon, lat]): LonLat => [lon, lat + 0.1])
  const p = [...a, ...b]
  const t = [...temps(vingt(10)), ...temps(vingt(10))]
  const debutDeB = a.length // index du premier point de la seconde sortie

  it('ne remonte pas dans la sortie précédente', () => {
    // Le segment B0 → B1 : rien avant B0 ne doit entrer.
    expect(windowedSpeedMps(p, t, debutDeB + 1)).toBeCloseTo(
      vitesseEntre(p, t, debutDeB, debutDeB + 7),
      9,
    )
  })

  it('ne déborde pas sur la sortie suivante', () => {
    // Le dernier segment de A : rien après A20 ne doit entrer.
    const dernierDeA = a.length - 1
    expect(windowedSpeedMps(p, t, dernierDeA)).toBeCloseTo(
      vitesseEntre(p, t, dernierDeA - 7, dernierDeA),
      9,
    )
  })
})

/*
  Survivants équivalents, écrits pour ne pas être rechassés (§6bis) :
  - `lo > 0` → `lo >= 0` et `hi < points.length - 1` → `hi < points.length` :
    on lit alors `times[-1]` ou `times[n]`, `undefined`, que `== null`
    arrête de toute façon ;
  - `lo = i - 1` → `lo = i + 1` : le balayage arrière repasse par `i` et
    `i − 1`, dont les heures sont dans la fenêtre, et s'arrête au même point ;
  - la garde `tLo == null || tHi == null` retirée : la fenêtre ne s'étend
    que sur des heures non nulles, ses deux bornes en ont donc toujours une.
    La garde sert au typage, pas au calcul.
*/
