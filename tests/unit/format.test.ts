import { describe, it, expect } from 'vitest'
import {
  formatChrono,
  formatDetour,
  formatDistance,
  formatPct,
  displayName,
} from '../../src/lib/format.ts'
import type { Itinerary } from '../../src/core/types.ts'
import {
  COMPLETION_CHOICES,
  MILESTONES,
  isCompleted,
} from '../../src/core/milestones.ts'

/**
 * Le chronomètre de l'écran de marche (issue #152, pierre 3).
 *
 * Il tourne sous les yeux de quelqu'un qui marche : ce qui compte est qu'il
 * bouge chaque seconde et qu'il ne promette jamais plus de temps qu'il n'en
 * s'est écoulé.
 */

describe('formatChrono', () => {
  it('reste en minutes et secondes sous une heure', () => {
    expect(formatChrono(0)).toBe('0:00')
    expect(formatChrono(5_000)).toBe('0:05')
    expect(formatChrono(65_000)).toBe('1:05')
    expect(formatChrono(3_599_000)).toBe('59:59')
  })

  it('ajoute les heures dès la première', () => {
    expect(formatChrono(3_600_000)).toBe('1:00:00')
    expect(formatChrono(3_897_000)).toBe('1:04:57')
    expect(formatChrono(36_000_000)).toBe('10:00:00')
  })

  it('tronque au lieu d’arrondir : un chronomètre n’avance pas d’avance', () => {
    expect(formatChrono(1_999)).toBe('0:01')
  })

  it('ne rend jamais de temps négatif', () => {
    expect(formatChrono(-5_000)).toBe('0:00')
  })
})

describe('formatPct', () => {
  // Trouvé par mutation du 17/10 : jamais testé directement avec une valeur
  // à plus d'une décimale, donc `maximumFractionDigits: 1` pouvait
  // disparaître sans qu'aucun test ne s'en aperçoive.
  it('garde une décimale, pas plus', () => {
    expect(formatPct(34.567)).toBe('34,5 %')
    expect(formatPct(34)).toBe('34 %')
  })

  /*
    Issue #566 : `formatPct` arrondissait au plus proche, `isCompleted` et
    les jalons comparent la valeur brute. À 94,95 %, l'écran affichait
    « 95 % » sans la coche d'un seuil à 95 ; à 99,95 %, « 100 % » avec
    100 m restants. L'affichage et le seuil doivent dire la même chose,
    pour toute valeur — d'où une grille fine plutôt que deux exemples.
  */
  it('n’affiche jamais un seuil que le calcul n’a pas atteint', () => {
    expect(formatPct(94.95)).toBe('94,9 %')
    expect(formatPct(99.95)).toBe('99,9 %')
    const seuils = [...new Set([...COMPLETION_CHOICES, ...MILESTONES])]
    for (let milliemes = 0; milliemes <= 100_000; milliemes += 7) {
      const pct = milliemes / 1_000
      const affiche = Number(formatPct(pct).replace(' %', '').replace(',', '.'))
      for (const seuil of seuils) {
        expect(affiche >= seuil, `${String(pct)} % contre ${String(seuil)}`).toBe(
          isCompleted(pct, seuil),
        )
      }
    }
  })

  it('affiche bien le seuil quand il est atteint', () => {
    expect(formatPct(95)).toBe('95 %')
    expect(formatPct(100)).toBe('100 %')
    expect(formatPct(54.5)).toBe('54,5 %')
  })
})

describe('formatDistance', () => {
  // Trouvé par mutation du 17/10 : aucun test n'utilisait exactement 1 000 m,
  // la frontière entre l'affichage en mètres et en kilomètres.
  it('bascule en kilomètres à partir de 1 000 m, pas juste après', () => {
    expect(formatDistance(1_000)).toBe('1 km')
    expect(formatDistance(990)).toBe('990 m')
  })

  /*
    Trouvé par mutation du 17/10 : aucun test n'utilisait une distance
    négative ou infinie. La garde `Number.isFinite(meters) && meters > 0`
    protège de deux défauts différents, et chacun a besoin de sa propre
    valeur pour se révéler.
  */
  it('ne rend pas de distance négative', () => {
    expect(formatDistance(-50)).toBe('0 m')
  })

  it('ne rend pas de distance infinie', () => {
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('0 m')
  })
})

describe('formatDetour', () => {
  // Trouvé par mutation du 17/10 : seul appelé depuis PoiSection.tsx, sans
  // test unitaire direct — toute sa fonction (une délégation à
  // formatDistance) avait une couverture nulle.
  it('délègue à formatDistance', () => {
    expect(formatDetour(150)).toBe('150 m')
  })
})

describe('displayName', () => {
  function itineraire(
    ref: string | null,
    name: string | null,
    osmRelationId = 42,
  ): Itinerary {
    return {
      osmRelationId,
      ref,
      name,
      network: 'GR',
      ways: [],
      totalMeters: 0,
      fetchedAt: '2026-01-01T00:00:00Z',
    }
  }

  it('préfère la ref OSM', () => {
    expect(displayName(itineraire('GR 7', 'Tour du Pilat'))).toBe('GR 7')
  })

  it('se replie sur le nom quand la ref manque', () => {
    expect(displayName(itineraire(null, 'Tour du Pilat'))).toBe('Tour du Pilat')
  })

  // Trouvé par mutation du 17/10 : jamais testé avec ref ET nom absents —
  // le seul cas qui atteint le dernier repli, l'identifiant OSM.
  it('se replie sur l’identifiant quand ref et nom manquent tous deux', () => {
    expect(displayName(itineraire(null, null, 42))).toBe('Itinéraire 42')
  })
})
