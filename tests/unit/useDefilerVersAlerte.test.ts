// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useDefilerVersAlerte } from '../../src/lib/useDefilerVersAlerte.ts'

/**
 * Trouvé par mutation du 17/10 : ce crochet n'avait aucun test unitaire
 * (0 % de couverture) — même situation que `useEcranCompact` avant
 * `tests/unit/ecran.test.ts`, qui a introduit le harnais (`createRoot` +
 * `act`) repris ici à l'identique plutôt qu'une bibliothèque de test
 * supplémentaire pour un second crochet.
 *
 * `jsdom` n'implémente pas `Element.prototype.scrollIntoView` : on le pose
 * soi-même, comme `ecran.test.ts` le fait pour `matchMedia`.
 */

function monterLeHook(actifInitial: boolean, aussiInitial?: unknown) {
  function Sonde({ actif, aussi }: { actif: boolean; aussi?: unknown }) {
    const ref = useDefilerVersAlerte<HTMLDivElement>(actif, aussi)
    return createElement('div', { ref })
  }

  const conteneur = document.createElement('div')
  let racine: Root
  act(() => {
    racine = createRoot(conteneur)
    racine.render(createElement(Sonde, { actif: actifInitial, aussi: aussiInitial }))
  })

  return {
    rerendre: (actif: boolean, aussi?: unknown) => {
      act(() => {
        racine.render(createElement(Sonde, { actif, aussi }))
      })
    },
    demonter: () => {
      act(() => {
        racine.unmount()
      })
    },
  }
}

async function laisserPasserLaTrame() {
  // `requestAnimationFrame` de jsdom est réel : il faut lui laisser une
  // trame pour s'exécuter, sous `act` pour que React absorbe les effets
  // qu'il déclenche.
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

describe('useDefilerVersAlerte', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ne défile pas tant que `active` est faux', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { demonter } = monterLeHook(false)
    await laisserPasserLaTrame()
    expect(scrollIntoView).not.toHaveBeenCalled()
    demonter()
  })

  it('ramène l’élément dans la fenêtre quand `active` est vrai', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { demonter } = monterLeHook(true)
    await laisserPasserLaTrame()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    demonter()
  })

  it('annule le défilement en attente si on démonte avant la trame suivante', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const { demonter } = monterLeHook(true)
    demonter()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('rejoue le défilement quand `aussi` change, même si `active` reste vrai', async () => {
    /*
      Le cas qui donne son sens à `aussi` (voir le commentaire du module) :
      une alerte déjà active au moment où une boîte qui la contenait
      s'ouvre. `active` seul ne change pas ; `aussi` doit relancer l'effet.
    */
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerendre, demonter } = monterLeHook(true, false)
    await laisserPasserLaTrame()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    rerendre(true, true)
    await laisserPasserLaTrame()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    demonter()
  })
})
