import { describe, it, expect, vi } from 'vitest'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { appliquerQuandPret } from '../../src/components/map/useMapSources.ts'

/**
 * Le repère du profil altimétrique disparaissait par intermittence, et la
 * suite e2e le prenait sur le fait environ une fois sur trois sous charge.
 *
 * La cause n'était pas la lenteur : un `apply` mis en attente sur « idle »
 * ferme sur les données de son rendu, et rejouait donc un état périmé quand
 * la carte devenait inactive après un rendu plus récent.
 */
function carteFactice(styleCharge: boolean) {
  const enAttente: (() => void)[] = []
  const map = {
    isStyleLoaded: () => styleCharge,
    once: (_evenement: string, fn: () => void) => {
      enAttente.push(fn)
    },
    off: (_evenement: string, fn: () => void) => {
      const index = enAttente.indexOf(fn)
      if (index >= 0) enAttente.splice(index, 1)
    },
  } as unknown as MaplibreMap
  return {
    map,
    devenirInactive: () => {
      for (const fn of enAttente.slice()) fn()
    },
  }
}

describe('appliquerQuandPret', () => {
  it('applique tout de suite quand le style est chargé', () => {
    const { map } = carteFactice(true)
    const apply = vi.fn()
    // Rien à annuler : il n'y a pas d'attente.
    expect(appliquerQuandPret(map, apply)).toBeUndefined()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('attend que la carte soit prête quand le style ne l’est pas', () => {
    const { map, devenirInactive } = carteFactice(false)
    const apply = vi.fn()
    appliquerQuandPret(map, apply)
    expect(apply).not.toHaveBeenCalled()
    devenirInactive()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('n’exécute pas une mise à jour annulée', () => {
    const { map, devenirInactive } = carteFactice(false)
    const apply = vi.fn()
    appliquerQuandPret(map, apply)?.()
    devenirInactive()
    expect(apply).not.toHaveBeenCalled()
  })

  it('laisse le dernier rendu gagner, et non le premier', () => {
    // Le scénario exact du repère : la fiche s'ouvre sans repère alors que
    // le style charge, puis le clic pose le repère. Sans le nettoyage, le
    // rendu d'avant le clic reprenait la main à l'inactivité suivante.
    const { map, devenirInactive } = carteFactice(false)
    const sansRepere = vi.fn()
    const avecRepere = vi.fn()
    const annuler = appliquerQuandPret(map, sansRepere)
    annuler?.()
    appliquerQuandPret(map, avecRepere)
    devenirInactive()
    expect(sansRepere).not.toHaveBeenCalled()
    expect(avecRepere).toHaveBeenCalledOnce()
  })
})
