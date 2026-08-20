import { describe, it, expect } from 'vitest'
import { importProgressLabel } from '../../src/lib/format.ts'

describe('importProgressLabel', () => {
  it('situe le fichier en cours dans le lot', () => {
    expect(
      importProgressLabel({ done: 1, total: 5, filename: 'sortie.gpx' }),
    ).toBe('Lecture de sortie.gpx (2 sur 5)…')
  })

  it('ne compte pas quand il n’y a qu’un fichier', () => {
    // « (1 sur 1) » est du bruit : le nom du fichier suffit.
    expect(importProgressLabel({ done: 0, total: 1, filename: 'a.gpx' })).toBe(
      'Lecture de a.gpx…',
    )
  })

  it('ne dépasse jamais le total annoncé', () => {
    expect(
      importProgressLabel({ done: 9, total: 3, filename: 'a.gpx' }),
    ).toContain('(3 sur 3)')
  })
})
