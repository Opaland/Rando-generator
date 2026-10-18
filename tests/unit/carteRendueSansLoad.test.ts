// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * La carte est « prête » quand son style est chargé, pas quand ses tuiles le
 * sont (#545).
 *
 * Mesuré le 18/10 sur 20 lancements d'une sonde e2e : 3 cartes au style
 * chargé, aux sources toutes présentes, n'avaient jamais émis `load`
 * (`_loaded` resté faux). Dans les trois, le fond IGN avait échoué et le
 * repli sur OpenStreetMap (`setStyle`) s'était fait **pendant** le premier
 * chargement. `ready` n'attendait que `load` : il est resté faux pour la
 * session, et aucun effet de données n'a jamais rien remis à la carte — ni
 * tracés, ni traces, ni réseau de fond. Pour qui ouvre l'application quand
 * l'IGN répond mal, une carte vide.
 *
 * MapLibre est remplacé par une carte factice : ce qui est éprouvé ici est
 * le contrat du crochet — `style.load` suffit — et non MapLibre lui-même.
 */
type Ecouteur = () => void

const cartes: CarteFactice[] = []

class CarteFactice {
  ecouteurs = new Map<string, Ecouteur[]>()
  constructor() {
    cartes.push(this)
  }
  on(type: string, fn: Ecouteur) {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), fn])
  }
  emettre(type: string) {
    for (const fn of this.ecouteurs.get(type) ?? []) fn()
  }
  addControl() {}
  setStyle() {}
  remove() {}
}

vi.mock('maplibre-gl', () => ({
  Map: CarteFactice,
  NavigationControl: function NavigationControl() {},
}))

const { useMapInstance } = await import(
  '../../src/components/map/useMapInstance.ts'
)

function monter() {
  const vu: { ready: boolean; styleEpoch: number }[] = []
  function Sonde() {
    const conteneur = useRef<HTMLDivElement | null>(null)
    const { ready, styleEpoch } = useMapInstance(conteneur)
    vu.push({ ready, styleEpoch })
    return createElement('div', { ref: conteneur })
  }
  const hote = document.createElement('div')
  let racine: Root
  act(() => {
    racine = createRoot(hote)
    racine.render(createElement(Sonde))
  })
  return {
    dernier: () => vu[vu.length - 1],
    demonter: () => {
      act(() => {
        racine.unmount()
      })
    },
  }
}

describe('useMapInstance', () => {
  afterEach(() => {
    cartes.length = 0
  })

  it('est prête dès le style chargé, même si `load` ne vient jamais', () => {
    const sonde = monter()
    expect(sonde.dernier()?.ready).toBe(false)
    act(() => {
      cartes[0]?.emettre('style.load')
    })
    expect(sonde.dernier()?.ready).toBe(true)
    sonde.demonter()
  })

  it('reste prête après `load`, et compte chaque style chargé', () => {
    const sonde = monter()
    act(() => {
      cartes[0]?.emettre('style.load')
      cartes[0]?.emettre('load')
    })
    expect(sonde.dernier()).toEqual({ ready: true, styleEpoch: 1 })
    // Le repli sur OSM recharge un style : les effets de données doivent
    // se rejouer sur les sources recréées.
    act(() => {
      cartes[0]?.emettre('style.load')
    })
    expect(sonde.dernier()).toEqual({ ready: true, styleEpoch: 2 })
    sonde.demonter()
  })
})
