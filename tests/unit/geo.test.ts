import { describe, it, expect } from 'vitest'
import {
  distanceMeters,
  cellKey,
  cellKeyFromIndices,
  cellIndices,
  interpolate,
  bearingDegrees,
  isWgs84Coordinate,
} from '../../src/core/geo.ts'
import type { LonLat } from '../../src/core/types.ts'

// Un degré de latitude vaut R × π / 180 ≈ 111 195 m avec R = 6 371 000 m.
const METERS_PER_DEG_LAT = (6_371_000 * Math.PI) / 180

describe('distanceMeters', () => {
  it('vaut 0 entre deux points identiques', () => {
    const p: LonLat = [4.5, 45.4]
    expect(distanceMeters(p, p)).toBe(0)
  })

  it('mesure 1° de latitude ≈ 111 195 m', () => {
    const d = distanceMeters([4, 45], [4, 46])
    expect(d).toBeCloseTo(METERS_PER_DEG_LAT, -1)
  })

  it('mesure 1° de longitude à 45° de latitude ≈ 111 195 × cos(45°)', () => {
    const d = distanceMeters([4, 45], [5, 45])
    const attendu = METERS_PER_DEG_LAT * Math.cos((45.5 * Math.PI) / 180)
    // L'approximation équirectangulaire utilise la latitude moyenne (ici 45°).
    const attenduLatMoyenne = METERS_PER_DEG_LAT * Math.cos((45 * Math.PI) / 180)
    expect(d).toBeCloseTo(attenduLatMoyenne, -2)
    expect(Math.abs(d - attendu) / d).toBeLessThan(0.02)
  })

  it('est symétrique', () => {
    const a: LonLat = [4.387, 45.457]
    const b: LonLat = [4.512, 45.389]
    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a))
  })

  it('reste précise à courte distance (~50 m) par rapport à haversine', () => {
    const a: LonLat = [4.5, 45.4]
    const b: LonLat = [4.5 + 0.0005, 45.4 + 0.0002]
    const equirect = distanceMeters(a, b)
    // Haversine de référence
    const R = 6_371_000
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(b[1] - a[1])
    const dLon = toRad(b[0] - a[0])
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
    const haversine = 2 * R * Math.asin(Math.sqrt(h))
    expect(Math.abs(equirect - haversine)).toBeLessThan(0.05)
  })
})

describe('cellKey / cellIndices', () => {
  it('regroupe deux points de la même cellule sous la même clé', () => {
    expect(cellKey(4.50001, 45.40001)).toBe(cellKey(4.50002, 45.40002))
  })

  it('sépare deux points distants de plus d’une cellule', () => {
    expect(cellKey(4.5, 45.4)).not.toBe(cellKey(4.5 + 0.0031, 45.4))
    expect(cellKey(4.5, 45.4)).not.toBe(cellKey(4.5, 45.4 + 0.0031))
  })

  it('gère les coordonnées négatives sans collision autour de zéro', () => {
    // floor (et non troncature) : -0.0001 et +0.0001 sont dans des cellules différentes
    expect(cellKey(-0.0001, 45.4)).not.toBe(cellKey(0.0001, 45.4))
  })

  it('cellIndices et cellKeyFromIndices sont cohérents avec cellKey', () => {
    const [cx, cy] = cellIndices(4.5123, 45.4567)
    expect(cellKeyFromIndices(cx, cy)).toBe(cellKey(4.5123, 45.4567))
  })
})

describe('interpolate', () => {
  const a: LonLat = [4.0, 45.0]
  const b: LonLat = [5.0, 46.0]

  it('retourne a pour t = 0 et b pour t = 1', () => {
    expect(interpolate(a, b, 0)).toEqual(a)
    expect(interpolate(a, b, 1)).toEqual(b)
  })

  it('retourne le milieu pour t = 0,5', () => {
    expect(interpolate(a, b, 0.5)).toEqual([4.5, 45.5])
  })
})

describe('bearingDegrees', () => {
  it('vaut ~0 plein nord, ~90 plein est, ~180 plein sud, ~270 plein ouest', () => {
    const origin: LonLat = [4.5, 45.4]
    expect(bearingDegrees(origin, [4.5, 45.5])).toBeCloseTo(0, 0)
    expect(bearingDegrees(origin, [4.6, 45.4])).toBeCloseTo(90, 0)
    expect(bearingDegrees(origin, [4.5, 45.3])).toBeCloseTo(180, 0)
    expect(bearingDegrees(origin, [4.4, 45.4])).toBeCloseTo(270, 0)
  })

  it('reste dans [0, 360)', () => {
    const b = bearingDegrees([4.6, 45.4], [4.5, 45.4])
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })

  it('calcule un cap diagonal précis, pas seulement les quatre points cardinaux', () => {
    /*
      Trouvé par mutation du 17/10 : les quatre points cardinaux ont chacun
      soit dLon = 0 (nord/sud) soit lat1 = lat2 avec un dLon minuscule
      (est/ouest) — deux cas où `sin(dLon) * cos(lat2)` et le second terme
      de `x` valent 0, ou sont trop peu sensibles à `*` devenu `/`, pour
      qu'une tolérance à l'entier (`toBeCloseTo(_, 0)`) les distingue. Un
      cap vraiment diagonal, avec une précision fine, n'a pas cette
      coïncidence.
    */
    expect(bearingDegrees([4.5, 45.4], [5.5, 46.4])).toBeCloseTo(34.476492, 4)
  })
})

describe('isWgs84Coordinate', () => {
  /*
    Trouvé par mutation du 17/10 : cette fonction n'avait aucun test direct
    — seulement une mise à l'épreuve indirecte via ses appelants
    (grNord.ts, boucles.ts, geojson.ts), qui ne couvrait jamais chaque
    clause de la chaîne séparément.
  */
  it('accepte une coordonnée WGS84 ordinaire', () => {
    expect(isWgs84Coordinate([4.5, 45.4])).toBe(true)
  })

  it('rejette ce qui n’est pas un tableau, même un objet aux clés numériques', () => {
    // Un objet `{0: 4.5, 1: 45.4}` passerait les contrôles suivants si
    // `Array.isArray` était retiré de la chaîne.
    expect(isWgs84Coordinate({ 0: 4.5, 1: 45.4 })).toBe(false)
    expect(isWgs84Coordinate('4.5,45.4')).toBe(false)
    expect(isWgs84Coordinate(null)).toBe(false)
    expect(isWgs84Coordinate(undefined)).toBe(false)
  })

  it('rejette une longitude ou une latitude qui n’est pas un nombre', () => {
    expect(isWgs84Coordinate(['4.5', 45.4])).toBe(false)
    expect(isWgs84Coordinate([4.5, '45.4'])).toBe(false)
  })

  it('accepte les bornes exactes, et rejette juste au-delà', () => {
    expect(isWgs84Coordinate([180, 90])).toBe(true)
    expect(isWgs84Coordinate([-180, -90])).toBe(true)
    expect(isWgs84Coordinate([180.0001, 45])).toBe(false)
    expect(isWgs84Coordinate([45, 90.0001])).toBe(false)
  })
})
