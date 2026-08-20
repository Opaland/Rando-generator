import { describe, expect, it } from 'vitest'
import { formatAnciennete, formatOctets } from '../../src/lib/format.ts'

describe('formatOctets', () => {
  it('reste en octets sous le kilo-octet', () => {
    expect(formatOctets(0)).toBe('0 o')
    expect(formatOctets(842)).toBe('842 o')
  })

  it('passe en ko puis en Mo', () => {
    expect(formatOctets(1024)).toBe('1 ko')
    expect(formatOctets(1024 * 250)).toBe('250 ko')
    expect(formatOctets(1024 * 1024 * 3.5)).toBe('3,5 Mo')
  })

  it('n’affiche pas de décimale pour les ko : elle ne dit rien', () => {
    expect(formatOctets(1024 * 250 + 700)).toBe('250 ko')
  })

  it('ne rend pas de valeur négative ni NaN', () => {
    expect(formatOctets(-5)).toBe('0 o')
    expect(formatOctets(Number.NaN)).toBe('0 o')
  })
})

describe('formatAnciennete', () => {
  it('parle en jours pour les deux premiers mois', () => {
    expect(formatAnciennete(0)).toBe('aujourd’hui')
    expect(formatAnciennete(1)).toBe('hier')
    expect(formatAnciennete(45)).toBe('il y a 45 jours')
  })

  it('passe aux mois, puis aux années', () => {
    expect(formatAnciennete(90)).toBe('il y a 3 mois')
    expect(formatAnciennete(2696)).toBe('il y a 7 ans')
  })

  it('ne rend pas d’ancienneté négative', () => {
    expect(formatAnciennete(-10)).toBe('aujourd’hui')
  })
})
