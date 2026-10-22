import { describe, it, expect } from 'vitest'
import { assessItinerary } from '../../src/core/dataQuality.ts'
import { isFresh } from '../../src/db/database.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

/**
 * Issue #571 — la fraîcheur à 30 jours, comptée deux fois, pas pareil.
 *
 * `isFresh` (`db/database.ts`) jugeait une copie périmée à 30 jours tout
 * rond, en millisecondes ; `assessItinerary` (`core/dataQuality.ts`)
 * n'avertissait qu'au-delà de 30 jours **entiers**. Une copie de 30,5 jours
 * était rechargée sans qu'aucun avertissement ne l'ait annoncée (§4ter).
 */
const TELECHARGE = '2026-01-01T00:00:00Z'
const itin = makeItinerary(
  1,
  [{ osmWayId: 1, coords: straightLine(4.5, 45.4, 1000, 100) }],
  { fetchedAt: TELECHARGE },
)

function averti(maintenant: string): boolean {
  return assessItinerary(itin, maintenant).warnings.some((w) =>
    w.includes('Tracés téléchargés'),
  )
}

describe('la fraîcheur d’une copie', () => {
  it('à 30,5 jours, la copie rechargée a été annoncée', () => {
    const maintenant = new Date(Date.parse(TELECHARGE) + 30.5 * 86_400_000).toISOString()
    expect(isFresh(TELECHARGE, maintenant)).toBe(false)
    expect(averti(maintenant)).toBe(true)
  })

  it('avertir et recharger disent la même chose, heure par heure', () => {
    for (let heures = 0; heures <= 40 * 24; heures += 1) {
      const maintenant = new Date(
        Date.parse(TELECHARGE) + heures * 3_600_000,
      ).toISOString()
      expect(averti(maintenant), `${String(heures)} h`).toBe(
        !isFresh(TELECHARGE, maintenant),
      )
    }
  })
})
