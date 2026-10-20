import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { creerReglageDiffere } from '../../src/lib/reglageDiffere.ts'

/**
 * Issue #569, point 2 — le curseur de tolérance.
 *
 * Deux défauts constatés à la lecture de `Settings.tsx` :
 * - `setDraft(null)` arrivait après `await recompute`. Sur une grosse zone,
 *   ce retour tombait pendant un nouveau glissement et ramenait le curseur
 *   à la valeur d'avant ;
 * - le minuteur de 250 ms était effacé au démontage : un réglage fait juste
 *   avant de quitter l'onglet était perdu.
 */

function banc() {
  const ecritures: { valeur: number; finir: () => void }[] = []
  const brouillons: (number | null)[] = []
  const reglage = creerReglageDiffere({
    delaiMs: 250,
    ecrire: (valeur) =>
      new Promise<void>((resolve) => {
        ecritures.push({ valeur, finir: resolve })
      }),
    brouillon: (valeur) => {
      brouillons.push(valeur)
    },
  })
  return { reglage, ecritures, brouillons, dernier: () => brouillons.at(-1) }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('le réglage différé', () => {
  it('montre la valeur tout de suite, et ne l’écrit qu’après le délai', () => {
    const b = banc()
    b.reglage.changer(60)
    expect(b.dernier()).toBe(60)
    expect(b.ecritures).toHaveLength(0)
    vi.advanceTimersByTime(250)
    expect(b.ecritures.map((e) => e.valeur)).toEqual([60])
  })

  it('n’écrit qu’une fois pour un glissement de plusieurs crans', () => {
    const b = banc()
    b.reglage.changer(50)
    vi.advanceTimersByTime(100)
    b.reglage.changer(55)
    vi.advanceTimersByTime(100)
    b.reglage.changer(60)
    vi.advanceTimersByTime(250)
    expect(b.ecritures.map((e) => e.valeur)).toEqual([60])
  })

  it('rend la main au magasin une fois la valeur écrite', async () => {
    const b = banc()
    b.reglage.changer(60)
    vi.advanceTimersByTime(250)
    b.ecritures[0]?.finir()
    await vi.runAllTimersAsync()
    expect(b.dernier()).toBeNull()
  })

  it('garde le nouveau glissement quand l’écriture d’avant finit pendant', async () => {
    const b = banc()
    b.reglage.changer(60)
    vi.advanceTimersByTime(250)
    // Le recalcul de 60 m dure ; on glisse à nouveau pendant ce temps.
    b.reglage.changer(80)
    b.ecritures[0]?.finir()
    await Promise.resolve()
    await Promise.resolve()
    // Le curseur ne doit pas revenir à la valeur du magasin.
    expect(b.dernier()).toBe(80)
  })

  it('écrit au démontage un réglage dont le délai n’a pas couru', () => {
    const b = banc()
    b.reglage.changer(70)
    vi.advanceTimersByTime(100)
    b.reglage.demonter()
    expect(b.ecritures.map((e) => e.valeur)).toEqual([70])
    // Et une seule fois : le minuteur ne repart pas derrière.
    vi.advanceTimersByTime(1_000)
    expect(b.ecritures).toHaveLength(1)
  })

  it('n’écrit rien au démontage quand rien n’est en attente', () => {
    const b = banc()
    b.reglage.changer(70)
    vi.advanceTimersByTime(250)
    b.reglage.demonter()
    expect(b.ecritures).toHaveLength(1)
  })

  it('ne touche plus au brouillon après le démontage', async () => {
    const b = banc()
    b.reglage.changer(70)
    vi.advanceTimersByTime(250)
    b.reglage.demonter()
    const avant = b.brouillons.length
    b.ecritures[0]?.finir()
    await vi.runAllTimersAsync()
    expect(b.brouillons).toHaveLength(avant)
  })
})
