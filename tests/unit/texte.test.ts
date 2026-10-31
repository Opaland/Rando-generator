import { describe, expect, it } from 'vitest'
import { pourChercher, sansAccents } from '../../src/core/texte.ts'

describe('sansAccents', () => {
  it('retire les diacritiques et garde la casse', () => {
    expect(sansAccents('Crêt de la Perdrix')).toBe('Cret de la Perdrix')
    expect(sansAccents('Ouénarou')).toBe('Ouenarou')
  })
})

describe('pourChercher', () => {
  it('rend la même chaîne quelle que soit la façon de taper', () => {
    for (const frappe of ['crêt', 'CRÊT', 'cret', 'CRET']) {
      expect(pourChercher(frappe)).toBe('cret')
    }
  })

  it('replie aussi une lettre déjà décomposée', () => {
    expect(pourChercher('Crêt')).toBe('cret')
  })
})
