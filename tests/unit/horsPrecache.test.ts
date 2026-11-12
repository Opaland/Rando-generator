import { describe, it, expect } from 'vitest'
import {
  atteintsStatiquement,
  estLeSdkClaude,
  importsStatiques,
} from '../../src/lib/horsPrecache.ts'

/**
 * #673, 12/11 — la CI a montré qu'un bloc écarté du précache mais importé
 * statiquement par la page empêche l'application de démarrer hors ligne.
 * Ces fonctions servent la garde de `vite.config.ts` qui refuse alors la
 * construction.
 */
describe('importsStatiques', () => {
  it('lit les imports statiques d’un bloc minifié, pas les dynamiques', () => {
    const code =
      'import{n}from"./sdk-claude-Bge4.js";import"./style-1.js";' +
      'const m=()=>import("./claude-EgG.js");__vitePreload(()=>import("./x-1.js"),[])'
    expect(importsStatiques(code).sort()).toEqual(['sdk-claude-Bge4.js', 'style-1.js'])
  })
})

describe('atteintsStatiquement', () => {
  const blocs: Record<string, string> = {
    'index.js': 'import{a}from"./partage.js";const c=()=>import("./claude.js")',
    'partage.js': 'export const a=1',
    'claude.js': 'import{s}from"./sdk.js"',
    'sdk.js': '"anthropic-dangerous-direct-browser-access"',
  }
  const lire = (nom: string) => blocs[nom] ?? null

  it('suit les imports statiques, et s’arrête aux imports dynamiques', () => {
    expect([...atteintsStatiquement(['index.js'], lire)].sort()).toEqual([
      'index.js',
      'partage.js',
    ])
  })

  it('voit le SDK quand la page l’importe statiquement — le cas du 12/11', () => {
    const casse: Record<string, string> = { ...blocs, 'index.js': 'import{n}from"./sdk.js"' }
    const atteints = atteintsStatiquement(['index.js'], (n) => casse[n] ?? null)
    expect([...atteints].some((n) => estLeSdkClaude(casse[n] ?? ''))).toBe(true)
  })
})
