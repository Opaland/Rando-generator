// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { focusableSuivant } from '../../src/lib/focusSuivant.ts'

/**
 * Issue #658 — « Compris » et « Quitter la démonstration » disparaissent avec
 * l'avis qui les porte, et le focus retombait sur `BODY` : au clavier, on
 * repartait du haut de la page (WCAG 2.4.3, comme la fiche en #568).
 *
 * Le focus va à l'élément focalisable qui **suit** l'avis dans le document,
 * repéré avant qu'il disparaisse.
 */
beforeEach(() => {
  document.body.innerHTML = `
    <button id="avant">avant</button>
    <div id="avis"><button id="dedans">Compris</button></div>
    <span>texte</span>
    <button id="desactive" disabled>non</button>
    <div tabindex="-1" id="programmatique">non</div>
    <a id="lien-sans-href">non</a>
    <a id="lien" href="#x">suite</a>
    <button id="bouton-hors-clavier" tabindex="-1">non</button>
    <button id="masque">non</button>
    <button id="apres">après</button>
  `
})

describe('focusableSuivant', () => {
  it('rend le premier élément focalisable après l’avis, hors de l’avis', () => {
    const avis = document.getElementById('avis') as HTMLElement
    expect(focusableSuivant(avis)?.id).toBe('lien')
  })

  it('saute ce que le clavier n’atteint pas : désactivé, tabindex -1, lien sans href', () => {
    const avis = document.getElementById('avis') as HTMLElement
    expect(focusableSuivant(avis)?.id).not.toMatch(/desactive|programmatique|lien-sans-href/)
  })

  it('saute un bouton retiré du clavier, et ce qui n’est pas affiché', () => {
    // jsdom n'a pas `checkVisibility` : on le pose comme un navigateur.
    const masque = document.getElementById('masque') as HTMLElement
    Object.assign(masque, { checkVisibility: () => false })
    document.getElementById('lien')?.remove()
    const avis = document.getElementById('avis') as HTMLElement
    expect(focusableSuivant(avis)?.id).toBe('apres')
  })

  it('ne remonte pas avant l’avis', () => {
    const dernier = document.getElementById('apres') as HTMLElement
    expect(focusableSuivant(dernier)).toBeNull()
  })
})
