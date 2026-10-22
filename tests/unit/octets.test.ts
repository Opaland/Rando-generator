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

  // Trouvé par mutation du 17/10 : la frontière ko/Mo, à exactement un
  // mégaoctet, n'était jamais testée pile sur la borne.
  it('passe en Mo à exactement un mégaoctet, pas juste après', () => {
    expect(formatOctets(1024 * 1024)).toBe('1 Mo')
  })

  // Trouvé par mutation du 17/10 : aucun test n'avait une valeur en Mo avec
  // plus d'une décimale, donc `maximumFractionDigits: 1` pouvait disparaître
  // sans qu'aucun test ne s'en aperçoive.
  it('arrondit les Mo à une décimale, pas plus', () => {
    expect(formatOctets(1024 * 1024 * 3.567)).toBe('3,6 Mo')
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

  // Trouvé par mutation du 17/10 : les deux frontières (jours/mois à 60,
  // mois/années à 730) n'étaient jamais testées pile sur la borne.
  it('passe aux mois à exactement 60 jours, pas juste après', () => {
    expect(formatAnciennete(60)).toBe('il y a 2 mois')
  })

  it('passe aux années à exactement 730 jours, pas juste après', () => {
    expect(formatAnciennete(730)).toBe('il y a 2 ans')
  })
})
