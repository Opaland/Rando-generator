// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useEcranCompact, LARGEUR_COMPACTE_MAX } from '../../src/lib/ecran.ts'

/**
 * `useEcranCompact` décide quelles sections la navigation par onglets rend
 * (issue #171) — `pointDeRupture.test.ts` garde l'accord de la constante
 * avec le CSS, mais n'appelle jamais le hook lui-même : 0 % de branche
 * mesuré le 08/10 (`docs/ANALYSE_08_10.md`).
 *
 * Aucun hook n'est testé ailleurs dans ce dépôt en dehors de Playwright —
 * ce fichier introduit le seul harnais nécessaire (`createRoot` + `act`,
 * déjà présents via `react-dom`) plutôt qu'une bibliothèque de test
 * supplémentaire pour un seul hook.
 */

/**
 * Un `MediaQueryList` minimal, pilotable à la main.
 *
 * `ecouteurs.size` est exposé pour vérifier le retrait de l'écouteur
 * **directement** — pas en observant si l'état a rendu de nouveau. React 18
 * rend sans effet un `setState` appelé après démontage (aucun avertissement,
 * aucun rendu) : une assertion sur `valeurs` après démontage resterait
 * verte même sans retirer l'écouteur, et ne prouverait donc rien (§1bis).
 */
function fausseMediaQueryList(matches: boolean): MediaQueryList & {
  emettre: (matches: boolean) => void
  ecouteurs: Set<(e: MediaQueryListEvent) => void>
} {
  let courant = matches
  const ecouteurs = new Set<(e: MediaQueryListEvent) => void>()
  return {
    get matches() {
      return courant
    },
    media: `(max-width: ${String(LARGEUR_COMPACTE_MAX)}px)`,
    ecouteurs,
    addEventListener: (_type: string, ecouteur: (e: MediaQueryListEvent) => void) => {
      ecouteurs.add(ecouteur)
    },
    removeEventListener: (_type: string, ecouteur: (e: MediaQueryListEvent) => void) => {
      ecouteurs.delete(ecouteur)
    },
    emettre(nouveau: boolean) {
      courant = nouveau
      for (const ecouteur of ecouteurs) {
        ecouteur({ matches: nouveau } as MediaQueryListEvent)
      }
    },
  } as unknown as MediaQueryList & {
    emettre: (matches: boolean) => void
    ecouteurs: Set<(e: MediaQueryListEvent) => void>
  }
}

function monterLeHook(initial: boolean) {
  const mql = fausseMediaQueryList(initial)
  // jsdom n'implémente pas `matchMedia` : `vi.spyOn` ne peut pas espionner
  // une propriété absente, on la pose donc directement.
  window.matchMedia = vi.fn().mockReturnValue(mql)

  const valeurs: boolean[] = []
  function Sonde() {
    valeurs.push(useEcranCompact())
    return null
  }

  const conteneur = document.createElement('div')
  let racine: Root
  act(() => {
    racine = createRoot(conteneur)
    racine.render(createElement(Sonde))
  })

  return {
    mql,
    valeurs,
    demonter: () => {
      act(() => {
        racine.unmount()
      })
    },
  }
}

describe('useEcranCompact', () => {
  it('lit `matchMedia` dès le premier rendu, sans clignoter', () => {
    const { valeurs, demonter } = monterLeHook(true)
    expect(valeurs).toEqual([true])
    demonter()
  })

  it('part à `false` sur un écran large', () => {
    const { valeurs, demonter } = monterLeHook(false)
    expect(valeurs).toEqual([false])
    demonter()
  })

  it('suit un changement de largeur après montage', () => {
    const { mql, valeurs, demonter } = monterLeHook(false)
    act(() => {
      ;(mql as unknown as { emettre: (m: boolean) => void }).emettre(true)
    })
    expect(valeurs.at(-1)).toBe(true)
    demonter()
  })

  it('retire son écouteur au démontage', () => {
    const { mql, demonter } = monterLeHook(false)
    expect(mql.ecouteurs.size).toBe(1)
    demonter()
    expect(mql.ecouteurs.size).toBe(0)
  })
})
