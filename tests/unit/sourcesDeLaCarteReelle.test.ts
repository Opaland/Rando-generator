// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import { useMapSources } from '../../src/components/map/useMapSources.ts'
import { useAppStore } from '../../src/store/appStore.ts'
import type { Itinerary, TrailWay } from '../../src/core/types.ts'

/**
 * `useMapSources` câble le magasin réel sur les sources GeoJSON de la
 * carte — 124 mutants sans aucune couverture avant le 18/10, malgré un
 * usage réel (`MapView.tsx`). Les transformations qu'il appelle
 * (`buildTrailGeoJSON`, `poisToGeoJSON`…) sont déjà éprouvées pour
 * elles-mêmes ; ce test porte sur le câblage lui-même — en particulier la
 * fusion des itinéraires persos, jamais exercée.
 *
 * Harnais `createRoot` + `act` déjà repris de `useDefilerVersAlerte.test.ts`.
 * La carte factice étend celle de `mapSources.test.ts` : mêmes sources
 * toujours prêtes, avec un `setData` espionné par source.
 */

const etatInitial = { ...useAppStore.getState() }

function way(id: number, coords: [number, number][]): TrailWay {
  return { osmWayId: id, coords }
}

function itineraire(id: number, ref: string): Itinerary {
  return {
    osmRelationId: id,
    ref,
    name: null,
    // PR, pas GR : GR est replié par défaut (`RESEAUX_REPLIES_PAR_DEFAUT`),
    // ce qui masquerait `itineraries` sans rien dire du câblage testé ici.
    network: 'PR',
    ways: [way(id * 10, [[4.5, 45.4], [4.51, 45.4]])],
    totalMeters: 1000,
    fetchedAt: '2026-08-24T00:00:00Z',
  }
}

const SOURCES_CARTE = [
  'trails',
  'trails-done',
  'trails-declares',
  'trails-revetement',
  'tracks',
  'pois',
  'draw',
  'draw-points',
  'user-position',
  'elevation-hover',
]

function carteFactice() {
  const setData = new Map<string, ReturnType<typeof vi.fn>>()
  for (const id of SOURCES_CARTE) setData.set(id, vi.fn())
  const map = {
    getSource: (id: string) =>
      setData.has(id) ? ({ setData: setData.get(id) } as unknown as GeoJSONSource) : undefined,
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MaplibreMap
  return { map, setData }
}

function monterLeHook(mapRef: RefObject<MaplibreMap | null>) {
  function Sonde() {
    useMapSources(mapRef, true, 0)
    return null
  }
  const conteneur = document.createElement('div')
  let racine: Root
  act(() => {
    racine = createRoot(conteneur)
    racine.render(createElement(Sonde))
  })
  return {
    demonter: () => {
      act(() => {
        racine.unmount()
      })
    },
  }
}

describe('useMapSources', () => {
  afterEach(() => {
    useAppStore.setState(etatInitial, true)
  })

  it('fusionne les itinéraires persos dans les sources trails/trails-done, sans les perdre', () => {
    /*
      Trouvé par mutation du 18/10 : `base.features.push(...custom.base.features)`
      n'était exercé par aucun test — un oubli de cette ligne resterait
      invisible jusqu'à ce qu'un itinéraire personnel disparaisse de la
      carte en silence.
    */
    useAppStore.setState(
      {
        itineraries: [itineraire(1, 'GR 7')],
        customItineraries: [itineraire(2, 'Mon tracé')],
      },
      false,
    )
    const { map, setData } = carteFactice()
    const { demonter } = monterLeHook({ current: map })

    const base = setData.get('trails')?.mock.calls[0]?.[0] as
      | { features: { properties?: { itineraryId?: number } }[] }
      | undefined
    expect(base?.features.map((f) => f.properties?.itineraryId)).toEqual(
      expect.arrayContaining([1, 2]),
    )
    demonter()
  })

  it('vide la source du terrain quand aucune fiche n’est ouverte', () => {
    // `detailItineraryId` par défaut (null) ne filtre aucun itinéraire réel :
    // `trails-revetement` doit donc rester une collection vide.
    useAppStore.setState({ itineraries: [itineraire(1, 'GR 7')] }, false)
    const { map, setData } = carteFactice()
    const { demonter } = monterLeHook({ current: map })

    const revetement = setData.get('trails-revetement')?.mock.calls[0]?.[0] as
      | { features: unknown[] }
      | undefined
    expect(revetement?.features).toEqual([])
    demonter()
  })
})
