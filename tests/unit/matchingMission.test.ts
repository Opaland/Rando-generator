// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import { parseGpx } from '../../src/core/gpx.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * Cas adverses issus de l'audit externe du 20/08, non couverts par
 * matchingQuality.test.ts :
 * GPS bruité, GPS dense, sentiers parallèles proches, croisements, boucles,
 * sentiers superposés, GPX incomplet, multi-tracks, départ en milieu
 * d'itinéraire, géométrie OSM incomplète.
 *
 * Ces tests MESURENT le comportement actuel. Un `expect` qui documente une
 * limite connue est annoté LIMITE : il passe aujourd'hui en décrivant une
 * faille, et c'est son inversion qui marquera la correction.
 *
 *   ±60 m de bruit crédité à 100 %  → issue #150
 *   voiture le long du sentier      → issue #150
 *   parallèles à 15 m               → issue #151
 *
 * Ne pas « réparer » un test LIMITE en ajustant son seuil : ce serait perdre
 * la mesure sans corriger le moteur.
 *
 * Repères à 45,4° : 1e-5° lat ≈ 1,11 m ; 1e-5° lon ≈ 0,78 m.
 */

const LAT = 45.4
const LON_START = 4.5
const LON_END = 4.6
const METER_LAT = 1 / 111_195

function sentierDroit(id = 1, wayId = 10, offsetMeters = 0): Itinerary {
  return {
    osmRelationId: id,
    ref: `GR ${id}`,
    name: null,
    network: 'GR',
    ways: [
      {
        osmWayId: wayId,
        coords: [
          [LON_START, LAT + offsetMeters * METER_LAT],
          [LON_END, LAT + offsetMeters * METER_LAT],
        ],
      },
    ],
    totalMeters: 7800,
    fetchedAt: '2026-08-20T00:00:00Z',
  }
}

function traceParallele(
  offsetMeters: number,
  stepDeg = 0.0002,
  lonStart = LON_START,
  lonEnd = LON_END,
): LonLat[] {
  const lat = LAT + offsetMeters * METER_LAT
  const points: LonLat[] = []
  for (let lon = lonStart; lon <= lonEnd + 1e-9; lon += stepDeg) {
    points.push([Number(lon.toFixed(7)), lat])
  }
  if ((points[points.length - 1] as LonLat)[0] < lonEnd) {
    points.push([lonEnd, lat])
  }
  return points
}

function match(itins: Itinerary[], points: LonLat[], tolerance = 50) {
  return runMatching(itins, points, {
    toleranceMeters: tolerance,
    computedAt: '2026-08-20T00:00:00Z',
  })
}

/** Bruit pseudo-aléatoire déterministe (mulberry32) — tests reproductibles. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('cas 3 — GPS très bruité', () => {
  it('un bruit de ±15 m autour du sentier crédite encore l’essentiel', () => {
    const rand = rng(42)
    const points = traceParallele(0).map(
      ([lon, lat]): LonLat => [
        lon,
        lat + (rand() * 30 - 15) * METER_LAT,
      ],
    )
    const pct = match([sentierDroit()], points).global.pct
    expect(pct).toBeGreaterThan(90)
  })

  it('LIMITE : un bruit de ±60 m crédite encore 100 % du sentier', () => {
    const rand = rng(7)
    const points = traceParallele(0).map(
      ([lon, lat]): LonLat => [
        lon,
        lat + (rand() * 120 - 60) * METER_LAT,
      ],
    )
    const pct = match([sentierDroit()], points).global.pct
    // MESURÉ : les segments entre points bruités zigzaguent à travers le
    // sentier ; assez d'échantillons tombent sous le seuil de confirmation
    // (20 m) pour tout créditer. Sans hdop ni lissage, le moteur ne peut pas
    // distinguer ce bruit d'une vraie marche. Inverser ce test le jour où
    // hdop/filtrage existera.
    expect(pct).toBe(100)
  })
})

describe('cas 5 — GPS très dense', () => {
  it('un point tous les ~1,5 m donne le même résultat qu’un pas normal', () => {
    const dense = match([sentierDroit()], traceParallele(0, 0.00002)).global.pct
    const normal = match([sentierDroit()], traceParallele(0)).global.pct
    expect(Math.abs(dense - normal)).toBeLessThan(2)
  })
})

describe('cas 7 & 12 — sentiers parallèles proches', () => {
  it('deux sentiers séparés de 60 m : marcher sur l’un ne crédite pas l’autre', () => {
    const itins = [sentierDroit(1, 10, 0), sentierDroit(2, 20, 60)]
    const res = match(itins, traceParallele(0))
    const gr1 = res.results.find((r) => r.itineraryId === 1)
    const gr2 = res.results.find((r) => r.itineraryId === 2)
    expect(gr1?.pct ?? 0).toBeGreaterThan(95)
    expect(gr2?.pct ?? 0).toBe(0)
  })

  it('LIMITE : séparés de 15 m, l’autre sentier est aussi crédité', () => {
    const itins = [sentierDroit(1, 10, 0), sentierDroit(2, 20, 15)]
    const res = match(itins, traceParallele(0))
    const gr2 = res.results.find((r) => r.itineraryId === 2)
    // 15 m < confirmMeters (0.4 × 50 = 20 m) : la confirmation de proximité
    // ne peut pas distinguer deux sentiers plus proches que 20 m. Limite
    // documentée — inverser ce test si un jour le tie-break est implémenté.
    expect(gr2?.pct ?? 0).toBeGreaterThan(95)
  })
})

describe('cas 8 — chemins qui se croisent', () => {
  it('suivre un sentier ne crédite pas le sentier croisé en X', () => {
    const croisant: Itinerary = {
      osmRelationId: 3,
      ref: 'PR croisant',
      name: null,
      network: 'PR',
      ways: [
        {
          osmWayId: 30,
          coords: [
            [4.55, LAT - 3000 * METER_LAT],
            [4.55, LAT + 3000 * METER_LAT],
          ],
        },
      ],
      totalMeters: 6000,
      fetchedAt: '2026-08-20T00:00:00Z',
    }
    const res = match([sentierDroit(), croisant], traceParallele(0))
    const pr = res.results.find((r) => r.itineraryId === 3)
    expect(pr?.pct ?? 100).toBeLessThan(5)
  })
})

describe('cas 9 — boucle', () => {
  it('une boucle carrée parcourue en entier est créditée en entier', () => {
    const km = 1000 * METER_LAT
    const corners: LonLat[] = [
      [4.5, LAT],
      [4.5 + 0.0128, LAT], // ~1 km est
      [4.5 + 0.0128, LAT + km],
      [4.5, LAT + km],
      [4.5, LAT],
    ]
    const boucle: Itinerary = {
      osmRelationId: 4,
      ref: 'Boucle',
      name: null,
      network: 'LOCAL',
      ways: [{ osmWayId: 40, coords: corners }],
      totalMeters: 4000,
      fetchedAt: '2026-08-20T00:00:00Z',
    }
    // Trace : les mêmes coins, densifiés.
    const points: LonLat[] = []
    for (let i = 1; i < corners.length; i++) {
      const [ax, ay] = corners[i - 1] as LonLat
      const [bx, by] = corners[i] as LonLat
      for (let t = 0; t <= 1; t += 0.02) {
        points.push([ax + (bx - ax) * t, ay + (by - ay) * t])
      }
    }
    expect(match([boucle], points).global.pct).toBeGreaterThan(95)
  })
})

describe('cas 11 — sentiers superposés (way partagé)', () => {
  it('un way partagé GR/PR crédite les deux itinéraires, une fois le global', () => {
    const shared = {
      osmWayId: 10,
      coords: [
        [LON_START, LAT],
        [LON_END, LAT],
      ] as LonLat[],
    }
    const gr: Itinerary = { ...sentierDroit(1, 10), ways: [shared] }
    const pr: Itinerary = {
      ...sentierDroit(5, 10),
      ref: 'PR partagé',
      network: 'PR',
      ways: [shared],
    }
    const res = match([gr, pr], traceParallele(0))
    expect(res.results.find((r) => r.itineraryId === 1)?.pct).toBeGreaterThan(95)
    expect(res.results.find((r) => r.itineraryId === 5)?.pct).toBeGreaterThan(95)
    // Le global ne compte le way qu'une fois : ~7,8 km, pas 15,6.
    expect(res.global.totalMeters).toBeLessThan(9000)
  })
})

describe('cas 14 & 15 — GPX incomplet ou multi-tracks (parseur)', () => {
  it('un GPX à plusieurs <trk> concatène les tracks sans inventer de segment', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test">
      <trk><trkseg>
        <trkpt lat="${LAT}" lon="4.50"/><trkpt lat="${LAT}" lon="4.51"/><trkpt lat="${LAT}" lon="4.52"/>
      </trkseg></trk>
      <trk><trkseg>
        <trkpt lat="${LAT}" lon="4.58"/><trkpt lat="${LAT}" lon="4.59"/><trkpt lat="${LAT}" lon="4.60"/>
      </trkseg></trk>
    </gpx>`
    const parsed = parseGpx(gpx, new DOMParser())
    expect(parsed.points.length).toBe(6)
    const pct = match([sentierDroit()], parsed.points).global.pct
    // 4,52 → 4,58 : saut de ~4,7 km > MAX_GAP, non crédité. Seules les deux
    // extrémités (~2 × 1,6 km sur 7,8) doivent l'être. NOTE mesurée en
    // écrivant ce test : des points espacés de PLUS de 1 km (> MAX_GAP)
    // donnent 0 % — le segment est cassé en points isolés et la continuité
    // invalide le reste. Un GPX « économe » (montre en mode batterie) peut
    // donc être totalement ignoré sans avertissement à l'utilisateur.
    expect(pct).toBeGreaterThan(25)
    expect(pct).toBeLessThan(60)
  })

  it('un GPX tronqué (fichier coupé) est rejeté avec un message, pas un crash', () => {
    const tronque = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="45.4" lon="4.5"`
    expect(() => parseGpx(tronque, new DOMParser())).toThrow()
  })
})

describe('cas 17 — trace commençant au milieu de l’itinéraire', () => {
  it('la moitié centrale parcourue donne ~50 %, ni 0 ni 100', () => {
    const points = traceParallele(0, 0.0002, 4.525, 4.575)
    const pct = match([sentierDroit()], points).global.pct
    expect(pct).toBeGreaterThan(40)
    expect(pct).toBeLessThan(60)
  })
})

describe('cas 19 — géométrie OSM incomplète (relation en deux morceaux)', () => {
  it('les morceaux existants sont crédités, le trou ne compte pas comme total fantôme', () => {
    const enDeuxMorceaux: Itinerary = {
      osmRelationId: 6,
      ref: 'GR troué',
      name: null,
      network: 'GR',
      ways: [
        {
          osmWayId: 60,
          coords: [
            [4.5, LAT],
            [4.54, LAT],
          ],
        },
        {
          osmWayId: 61,
          coords: [
            [4.56, LAT],
            [4.6, LAT],
          ],
        },
      ],
      totalMeters: 6240,
      fetchedAt: '2026-08-20T00:00:00Z',
    }
    const res = match([enDeuxMorceaux], traceParallele(0))
    // La trace couvre tout, y compris le trou : le % doit rester ≤ 100 et le
    // total refléter la géométrie réellement connue (~6,2 km), pas 7,8.
    const r = res.results.find((x) => x.itineraryId === 6)
    expect(r?.pct ?? 0).toBeGreaterThan(95)
    expect(r?.pct ?? 200).toBeLessThanOrEqual(100)
    expect(res.global.totalMeters).toBeLessThan(7000)
  })
})

describe('cas 6 — vitesse élevée (voiture le long du sentier)', () => {
  it('LIMITE : sans horodatage conservé, un trajet en voiture est crédité', () => {
    // Points espacés de ~470 m (< MAX_GAP 1 km) : typique d'un GPS au volant.
    const pct = match([sentierDroit()], traceParallele(0, 0.006)).global.pct
    // Le parseur jette <time> : aucun contrôle de vitesse n'est possible.
    // Ce test documente la faille ; l'inverser quand le contrôle existera.
    expect(pct).toBeGreaterThan(90)
  })
})
