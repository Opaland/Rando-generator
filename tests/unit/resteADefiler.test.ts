import { describe, it, expect } from 'vitest'
import { resteADefiler } from '../../src/lib/useResteADefiler.ts'

/**
 * Issue #585 — à 1 024 px, la liste des zones s'arrêtait sous un intertitre
 * seul, sans rien qui dise qu'elle continue. Le fondu qui le dit ne doit
 * apparaître que s'il reste vraiment quelque chose dessous : un « ça
 * continue » peint au bout de la liste serait le même mensonge à l'envers.
 */
describe('resteADefiler', () => {
  it('dit oui en haut d’une liste plus haute que son cadre', () => {
    expect(resteADefiler({ scrollTop: 0, clientHeight: 280, scrollHeight: 900 })).toBe(true)
  })

  it('dit non au bout de la course', () => {
    expect(resteADefiler({ scrollTop: 620, clientHeight: 280, scrollHeight: 900 })).toBe(false)
  })

  it('dit non pour une liste qui tient dans son cadre', () => {
    expect(resteADefiler({ scrollTop: 0, clientHeight: 280, scrollHeight: 280 })).toBe(false)
  })

  it('dit oui à deux pixels du bout, non à moins d’un', () => {
    /*
      Sous un zoom fractionnaire, `scrollTop` s'arrête en sous-pixel au bout
      de la course (619,5 pour 620) : sans marge, le fondu resterait peint
      sur la dernière ligne. La marge d'un pixel est un choix de
      présentation (§2), pas une mesure.
    */
    expect(resteADefiler({ scrollTop: 618, clientHeight: 280, scrollHeight: 900 })).toBe(true)
    expect(resteADefiler({ scrollTop: 619.5, clientHeight: 280, scrollHeight: 900 })).toBe(false)
  })
})
