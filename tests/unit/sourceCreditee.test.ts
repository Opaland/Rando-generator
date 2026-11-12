import { describe, expect, it } from 'vitest'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { poserUneSourceCreditee } from '../../src/components/map/sourceCreditee.ts'

/**
 * #676 — une source recréée pour changer son crédit doit rendre ses couches
 * **au même rang** : l'ordre des couches est l'ordre de peinture, et
 * `trails` en a plusieurs, entrelacées avec celles d'autres sources.
 *
 * Une carte factice plutôt que MapLibre : sans WebGL, la vraie ne se crée
 * pas sous Vitest, et ce qu'on vérifie ici est une liste, pas un rendu.
 */
interface Couche {
  id: string
  source?: string
}

function carteFactice(couches: Couche[]) {
  const sources = new Map<string, { attribution?: string | undefined; donnees: unknown }>()
  sources.set('trails', { donnees: null })
  sources.set('pdipr', { donnees: null })
  let ordre = [...couches]
  const appels: string[] = []
  const carte = {
    getSource: (id: string) => {
      const s = sources.get(id)
      return s && {
        attribution: s.attribution,
        setData: (d: unknown) => {
          appels.push(`setData ${id}`)
          s.donnees = d
        },
      }
    },
    getStyle: () => ({ layers: ordre }),
    removeLayer: (id: string) => {
      ordre = ordre.filter((c) => c.id !== id)
    },
    removeSource: (id: string) => {
      if (ordre.some((c) => c.source === id)) throw new Error(`${id} encore lue`)
      sources.delete(id)
    },
    addSource: (id: string, spec: { attribution?: string; data: unknown }) => {
      appels.push(`addSource ${id}`)
      sources.set(id, { attribution: spec.attribution, donnees: spec.data })
    },
    addLayer: (couche: Couche, avant?: string) => {
      const rang = avant === undefined ? ordre.length : ordre.findIndex((c) => c.id === avant)
      if (rang < 0) throw new Error(`repère ${String(avant)} absent`)
      ordre.splice(rang, 0, couche)
    },
  }
  return {
    carte: carte as unknown as MaplibreMap,
    ordre: () => ordre.map((c) => c.id),
    attribution: (id: string) => sources.get(id)?.attribution,
    appels,
  }
}

const VIDE = { type: 'FeatureCollection' as const, features: [] }

const COUCHES: Couche[] = [
  { id: 'fond' },
  { id: 'pdipr-reseau', source: 'pdipr' },
  { id: 'trails-casing', source: 'trails' },
  { id: 'trails-line', source: 'trails' },
  { id: 'done-line', source: 'trails-done' },
  { id: 'trails-labels', source: 'trails' },
]

describe('poserUneSourceCreditee', () => {
  it('rend chaque couche de la source à son rang, même entrelacée', () => {
    const f = carteFactice(COUCHES)
    poserUneSourceCreditee(f.carte, 'trails', VIDE, 'Boucles locales © Métropole')
    expect(f.ordre()).toEqual(COUCHES.map((c) => c.id))
    expect(f.attribution('trails')).toBe('Boucles locales © Métropole')
  })

  it('une source en dernière position revient en dernière position', () => {
    const f = carteFactice([{ id: 'fond' }, { id: 'a', source: 'trails' }, { id: 'b', source: 'trails' }])
    poserUneSourceCreditee(f.carte, 'trails', VIDE, 'x')
    expect(f.ordre()).toEqual(['fond', 'a', 'b'])
  })

  it('le crédit retiré, la source perd son attribution', () => {
    const f = carteFactice(COUCHES)
    poserUneSourceCreditee(f.carte, 'trails', VIDE, 'x')
    poserUneSourceCreditee(f.carte, 'trails', VIDE, null)
    expect(f.attribution('trails')).toBeUndefined()
    expect(f.ordre()).toEqual(COUCHES.map((c) => c.id))
  })

  it('le même crédit : un simple setData, rien de recréé', () => {
    const f = carteFactice(COUCHES)
    poserUneSourceCreditee(f.carte, 'trails', VIDE, null)
    expect(f.appels).toEqual(['setData trails'])
  })

  it('ne touche pas aux couches des autres sources', () => {
    const f = carteFactice(COUCHES)
    poserUneSourceCreditee(f.carte, 'pdipr', VIDE, 'Réseau balisé © Isère')
    expect(f.ordre()).toEqual(COUCHES.map((c) => c.id))
    expect(f.attribution('trails')).toBeUndefined()
  })
})
