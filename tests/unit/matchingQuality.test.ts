import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * Scénarios adverses du matching : chacun a d'abord servi à **mesurer** le
 * comportement de l'ancien moteur (distance au point GPS le plus proche, sans
 * continuité), puis à valider le nouveau. Les valeurs « avant » sont
 * conservées en commentaire : ce sont elles qui ont justifié le changement.
 *
 * Repères à 45,4° de latitude : 1e-5° de latitude ≈ 1,11 m,
 * 1e-5° de longitude ≈ 0,78 m.
 */

const LAT = 45.4
const LON_START = 4.5
const LON_END = 4.6
const METER_LAT = 1 / 111_195

/** Sentier rectiligne est-ouest d'environ 7,8 km. */
function sentier(): Itinerary[] {
  return [
    {
      osmRelationId: 1,
      ref: 'GR test',
      name: null,
      network: 'GR',
      ways: [
        {
          osmWayId: 10,
          coords: [
            [LON_START, LAT],
            [LON_END, LAT],
          ],
        },
      ],
      totalMeters: 7800,
      fetchedAt: '2026-08-19T00:00:00Z',
    },
  ]
}

/** Trace parallèle au sentier, décalée de `offsetMeters` au nord. */
function traceParallele(offsetMeters: number, stepDeg = 0.0002): LonLat[] {
  const lat = LAT + offsetMeters * METER_LAT
  const points: LonLat[] = []
  for (let lon = LON_START; lon <= LON_END + 1e-9; lon += stepDeg) {
    points.push([Number(lon.toFixed(7)), lat])
  }
  // Garantit que la trace atteint la fin du sentier quel que soit le pas,
  // sinon la dernière portion fausse les comparaisons entre scénarios.
  if ((points[points.length - 1] as LonLat)[0] < LON_END) {
    points.push([LON_END, lat])
  }
  return points
}

function pctOf(trackPoints: LonLat[], toleranceMeters = 50): number {
  const result = runMatching(sentier(), trackPoints, {
    toleranceMeters,
    computedAt: '2026-08-19T00:00:00Z',
  })
  return result.global.pct
}

describe('scénarios adverses du matching', () => {
  it('trace superposée au sentier : 100 %', () => {
    expect(pctOf(traceParallele(0))).toBeCloseTo(100, 0)
  })

  it('une trace parallèle à 30 m ne crédite rien (avant : 100 %)', () => {
    // Le faux positif le plus grave : marcher sur une route qui longe le GR
    // à 30 m validait tout le sentier avec la tolérance par défaut.
    expect(pctOf(traceParallele(30))).toBe(0)
  })

  it('un décalage sous le seuil de confirmation reste crédité', () => {
    // 12 m de décalage constant : bruit GPS plausible, pas un autre chemin.
    expect(pctOf(traceParallele(12))).toBeCloseTo(100, 0)
  })

  it('une traversée perpendiculaire ne crédite rien (avant : ~2 %)', () => {
    const points: LonLat[] = []
    for (let d = -200; d <= 200; d += 10) {
      points.push([4.55, LAT + d * METER_LAT])
    }
    expect(pctOf(points)).toBe(0)
  })

  it('une trace peu échantillonnée suit quand même le sentier (avant : < 50 %)', () => {
    // Un point tous les ~500 m : l'appareil économise la batterie, la marche
    // n'est pas interrompue pour autant. La distance se mesure au segment,
    // plus au point.
    expect(pctOf(traceParallele(0, 0.0064))).toBeCloseTo(100, 0)
  })

  it('un vrai saut (plus d’un kilomètre) n’est pas considéré parcouru', () => {
    // Deux extrémités du sentier, rien entre les deux : trajet en voiture ou
    // appareil éteint. Seuls les abords des deux points comptent, et la
    // continuité les élimine.
    expect(pctOf([[LON_START, LAT], [LON_END, LAT]])).toBe(0)
  })

  it('la moitié parcourue donne bien ~50 %', () => {
    const moitie = traceParallele(0).filter(([lon]) => lon <= 4.55)
    expect(pctOf(moitie)).toBeGreaterThan(45)
    expect(pctOf(moitie)).toBeLessThan(55)
  })

  it('une trace qui quitte puis rejoint ne crédite pas la portion quittée', () => {
    const points: LonLat[] = []
    for (let lon = LON_START; lon <= LON_END + 1e-9; lon += 0.0002) {
      const ecart = lon > 4.52 && lon < 4.54 ? 200 : 0
      points.push([Number(lon.toFixed(7)), LAT + ecart * METER_LAT])
    }
    const pct = pctOf(points)
    expect(pct).toBeGreaterThan(70)
    expect(pct).toBeLessThan(90)
  })

  it('un aller-retour ne compte pas deux fois', () => {
    const aller = traceParallele(0).filter(([lon]) => lon <= 4.55)
    const retour = [...aller].reverse()
    expect(pctOf([...aller, ...retour])).toBeCloseTo(pctOf(aller), 0)
  })
})
