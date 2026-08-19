import { describe, it, expect } from 'vitest'
import { classifyNetwork } from '../../src/core/network.ts'

describe('classifyNetwork', () => {
  it('classe selon le tag network quand il est présent', () => {
    expect(classifyNetwork({ network: 'nwn' })).toBe('GR')
    expect(classifyNetwork({ network: 'rwn' })).toBe('GRP')
    expect(classifyNetwork({ network: 'lwn' })).toBe('PR')
  })

  it('le tag network prime sur le ref', () => {
    expect(classifyNetwork({ network: 'lwn', ref: 'GR 7' })).toBe('PR')
  })

  it('retombe sur le ref quand network est absent', () => {
    expect(classifyNetwork({ ref: 'GR 7' })).toBe('GR')
    expect(classifyNetwork({ ref: 'GR7' })).toBe('GR')
    expect(classifyNetwork({ ref: 'GRP Pilat' })).toBe('GRP')
    expect(classifyNetwork({ ref: 'PR 12' })).toBe('PR')
    expect(classifyNetwork({ ref: 'Balcons du Pilat' })).toBe('PR')
  })

  it('GRP est testé avant GR (préfixe commun)', () => {
    expect(classifyNetwork({ ref: 'GRP' })).toBe('GRP')
  })

  it('sans network ni ref → PR', () => {
    expect(classifyNetwork({})).toBe('PR')
    expect(classifyNetwork({ name: 'Sentier des crêtes' })).toBe('PR')
  })

  it('une valeur network inconnue retombe sur le ref', () => {
    expect(classifyNetwork({ network: 'iwn', ref: 'GR 65' })).toBe('GR')
    expect(classifyNetwork({ network: 'iwn' })).toBe('PR')
  })
})
