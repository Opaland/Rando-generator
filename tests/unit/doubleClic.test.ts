import { describe, it, expect } from 'vitest'
import { prolongeUnDoubleClic } from '../../src/lib/doubleClic.ts'

/**
 * La garde de #551. Le geste lui-même est éprouvé dans un vrai navigateur
 * par `tests/e2e/double-clic.spec.ts` ; ici, la frontière.
 */
describe('prolongeUnDoubleClic', () => {
  it('laisse passer le clavier (0) et un premier clic (1)', () => {
    expect(prolongeUnDoubleClic({ detail: 0 })).toBe(false)
    expect(prolongeUnDoubleClic({ detail: 1 })).toBe(false)
  })

  it('arrête le second clic d’un double-clic, et les suivants', () => {
    expect(prolongeUnDoubleClic({ detail: 2 })).toBe(true)
    expect(prolongeUnDoubleClic({ detail: 3 })).toBe(true)
  })
})
