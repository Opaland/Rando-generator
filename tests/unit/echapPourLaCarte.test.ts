// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { echapPourLaCarte } from '../../src/lib/echapPourLaCarte.ts'

/**
 * Issue #568, point 2 — Échap fermait la fiche même quand il servait à
 * autre chose.
 *
 * `MapView.tsx` écoutait `keydown` sur `window` sans regarder ni
 * `defaultPrevented`, ni la cible, ni une boîte de dialogue ouverte. Fiche
 * ouverte, puis « À propos », puis Échap : la fiche se fermait en plus de la
 * boîte. Même effet en tapant un nom de commune puis Échap pour effacer.
 */

afterEach(() => {
  document.body.innerHTML = ''
})

function echap(cible: EventTarget = document.body): KeyboardEvent {
  const evenement = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(evenement, 'target', { value: cible })
  return evenement
}

describe('echapPourLaCarte', () => {
  it('revient à la carte quand rien d’autre ne le réclame', () => {
    expect(echapPourLaCarte(echap())).toBe(true)
  })

  it('ne concerne que la touche Échap', () => {
    const entree = new KeyboardEvent('keydown', { key: 'Enter' })
    expect(echapPourLaCarte(entree)).toBe(false)
  })

  it('laisse Échap à une boîte de dialogue ouverte', () => {
    const boite = document.createElement('dialog')
    boite.setAttribute('open', '')
    document.body.append(boite)
    expect(echapPourLaCarte(echap())).toBe(false)
  })

  it('laisse Échap à un champ de saisie', () => {
    const champ = document.createElement('input')
    document.body.append(champ)
    expect(echapPourLaCarte(echap(champ))).toBe(false)
    const zone = document.createElement('textarea')
    document.body.append(zone)
    expect(echapPourLaCarte(echap(zone))).toBe(false)
  })

  it('laisse Échap à qui l’a déjà traité', () => {
    const evenement = echap()
    evenement.preventDefault()
    expect(echapPourLaCarte(evenement)).toBe(false)
  })
})
