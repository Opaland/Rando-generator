import { describe, it, expect } from 'vitest'
import { distanceParcourue } from '../../src/core/sortieEnCours.ts'
import type { Enregistrement, PointBrut } from '../../src/core/recorder.ts'
import { distanceMeters } from '../../src/core/geo.ts'

/**
 * Un relevé daté d'une pause, là où la vague de mutation du 19/10 a
 * trouvé `sortieEnCours.ts` sans test.
 *
 * `intervalleDe` dit à quel intervalle de marche appartient un instant, ou
 * −1 s'il tombe dans une pause. Trois mutants y survivaient — l'instant
 * avant le début d'un intervalle compté dedans, l'intervalle ouvert (la
 * marche en cours) jamais reconnu — parce qu'aucun test ne posait de relevé
 * **horodaté** pendant une pause.
 *
 * Le cas existe, mais pas par la porte qu'on imagine : `ajouterPoint`
 * refuse tout relevé **reçu** en pause. L'instant d'un relevé, lui, est
 * `position.timestamp` (`enregistrementSlice.ts`), l'heure du fix GPS, et
 * `GEO_OPTIONS.maximumAge` vaut 5 s : juste après une reprise, le
 * navigateur peut livrer une position de cache vieille de quelques
 * secondes. Elle est acceptée — on enregistre de nouveau —, et datée de la
 * pause.
 *
 * Un tel relevé ne doit relier ni ce qui précède ni ce qui suit.
 */

const point = (instant: number, est: number): PointBrut => ({
  lon: 5.7 + est / 78_710,
  lat: 45.1,
  instant,
  precisionMetres: 5,
  altitude: null,
})

describe('distanceParcourue', () => {
  it('ne relie pas un relevé reçu pendant une pause au premier relevé de la reprise', () => {
    // Marche de 0 à 10 s, pause, reprise à 20 s, toujours en cours. Le
    // relevé daté de 15 s est arrivé après la reprise, sorti du cache.
    const relevePendantLaPause = point(15_000, 200)
    const e: Enregistrement = {
      etat: 'enregistrement',
      points: [point(0, 0), point(10_000, 10), relevePendantLaPause, point(20_000, 210), point(30_000, 220)],
      demarreA: 0,
      termineA: null,
      intervalles: [
        { debut: 0, fin: 10_000 },
        { debut: 20_000, fin: null },
      ],
    }
    const attendu =
      distanceMeters([5.7, 45.1], [5.7 + 10 / 78_710, 45.1]) +
      distanceMeters([5.7 + 210 / 78_710, 45.1], [5.7 + 220 / 78_710, 45.1])
    expect(distanceParcourue(e)).toBeCloseTo(attendu, 6)
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `if (courant.length > 0)` forcé à vrai dans `segmentsMarches` : un
    tronçon vide ne porte aucune altitude, le dénivelé n'en tient pas
    compte ;
  - `GEO_OPTIONS.timeout ?? 20_000` en `&&` : `GEO_OPTIONS.timeout` vaut
    20 000, les deux formes rendent le même nombre.
*/
