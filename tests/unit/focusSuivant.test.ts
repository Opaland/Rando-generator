// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { fermerEnRendantLeFocus, focusableSuivant } from '../../src/lib/focusSuivant.ts'

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

/*
  Relecture adverse du 03/11. En disposition compacte, onglet
  « Progression », la suite de l'avis est le tableau de bord — que
  « Quitter » démonte, ses boucles retirées. Un `focus()` sur un nœud
  détaché ne fait rien, et le focus retombait sur BODY, le défaut même de
  #658. Et « Quitter » attend la relecture de la base : rendre le focus à
  la fin ne doit pas le reprendre à qui a déjà bougé.
*/
describe('fermerEnRendantLeFocus', () => {
  const attendre = () => new Promise((r) => setTimeout(r, 0))

  it('repère la suite avant de fermer, et lui rend le focus après', async () => {
    const avis = document.getElementById('avis') as HTMLElement
    document.getElementById('dedans')?.focus()
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
    })
    await attendre()
    expect(document.activeElement?.id).toBe('lien')
  })

  it('prend le suivant encore présent quand la suite a disparu en fermant', async () => {
    const avis = document.getElementById('avis') as HTMLElement
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
      document.getElementById('lien')?.remove()
    })
    await attendre()
    // Le bouton hors clavier est sauté ; `masque` est visible pour jsdom.
    expect(document.activeElement?.id).toBe('masque')
  })

  it('se rabat sur le conteneur de l’avis quand tout ce qui suivait a disparu', async () => {
    document.body.innerHTML = `
      <div id="feuille">
        <div id="avis"><button>Quitter</button></div>
        <section id="tableau"><button>tableau</button></section>
      </div>
      <div id="ailleurs"><button id="hors">hors</button></div>`
    const avis = document.getElementById('avis') as HTMLElement
    const feuille = document.getElementById('feuille') as HTMLElement
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
      document.getElementById('tableau')?.remove()
      feuille.insertAdjacentHTML('beforeend', '<button id="reste">reste</button>')
    })
    await attendre()
    expect(document.activeElement?.id).toBe('reste')
  })

  it('hors du conteneur vidé, passe un suivant détaché pour le suivant encore là', async () => {
    document.body.innerHTML = `
      <div id="feuille"><div id="avis"><button>Quitter</button></div></div>
      <button id="parti">parti</button>
      <button id="reste">reste</button>`
    const avis = document.getElementById('avis') as HTMLElement
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
      document.getElementById('parti')?.remove()
    })
    await attendre()
    expect(document.activeElement?.id).toBe('reste')
  })

  it('saute un suivant que la fermeture a masqué', async () => {
    // Une section qui se replie en même temps : présente, mais plus affichée.
    const avis = document.getElementById('avis') as HTMLElement
    const lien = document.getElementById('lien') as HTMLElement
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
      Object.assign(lien, { checkVisibility: () => false })
    })
    await attendre()
    expect(document.activeElement?.id).toBe('masque')
  })

  it('ne reprend pas le focus à qui l’a déjà déplacé pendant la fermeture', async () => {
    const avis = document.getElementById('avis') as HTMLElement
    let finir: () => void = () => undefined
    fermerEnRendantLeFocus(avis, () => {
      avis.remove()
      return new Promise<void>((r) => (finir = r))
    })
    document.getElementById('avant')?.focus()
    finir()
    await attendre()
    expect(document.activeElement?.id).toBe('avant')
  })
})
