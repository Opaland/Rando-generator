// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Issue #451 — un tracé en cours doit disparaître avec la zone qui le portait.
 *
 * ## Ce qui a été mesuré
 *
 * `setItineraries` remet à zéro ce que la nouvelle zone rend faux : la
 * célébration, le bilan de sortie ouvert, l'itinéraire sélectionné. Son
 * commentaire le dit — « le bilan de sortie ouvert nomme des itinéraires qui
 * ne sont plus là ». Le tracé en cours est exactement dans ce cas, et il n'y
 * était pas.
 *
 * Ce n'est pas un détail d'état interne : `drawPath` et `drawWaypoints`
 * alimentent directement deux sources de la carte
 * (`useMapSources.ts:234-246`). Un itinéraire dessiné dans le Pilat reste
 * donc **peint** par-dessus la Loire, sur un graphe où ses nœuds n'existent
 * plus. Les deux messages d'erreur que la situation produit —
 * « Aucun chemin ne ramène au point de départ dans les tracés affichés » —
 * sont justes ; c'est l'état qui ne l'est pas.
 *
 * ## Le seuil tranché, et celui qui a été écarté (§2)
 *
 * Deux façons de nettoyer, et elles ne changent rien à ce qui est calculé :
 * c'est donc un choix de présentation, que le §2 autorise à trancher au
 * jugement à condition d'écrire l'alternative rejetée.
 *
 * - **écartée** : `...TRACE_VIDE`, qui referme aussi le mode dessin. Le
 *   panneau disparaîtrait sous la main de quelqu'un qui vient seulement de
 *   changer de zone pour continuer à dessiner ailleurs ;
 * - **retenue** : vider les étapes et le chemin, garder `drawMode`. Le geste
 *   est préservé, seul son contenu périmé s'en va.
 */

/** État initial capturé à l'import : les actions, elles, ne changent pas. */
const etatInitial = { ...useAppStore.getState() }

function reponse(corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Une zone bien à part : aucun de ses nœuds n'est dans le Pilat. */
const ailleurs = {
  elements: [
    {
      type: 'relation',
      id: 2001,
      tags: { type: 'route', route: 'hiking', name: 'Bord de Loire' },
      members: [
        {
          type: 'way',
          ref: 900,
          role: '',
          geometry: [
            { lat: 47.2, lon: 1.1 },
            { lat: 47.2, lon: 1.11 },
            { lat: 47.2, lon: 1.12 },
          ],
        },
      ],
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  let interrogations = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (!url.includes('interpreter')) {
        return Promise.resolve(new Response('', { status: 404 }))
      }
      interrogations += 1
      return Promise.resolve(reponse(interrogations === 1 ? pilat : ailleurs))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('changer de zone pendant un tracé', () => {
  it('emporte les étapes et le chemin, et garde le mode dessin', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')

    useAppStore.getState().toggleDrawMode()
    useAppStore.getState().addDrawPoint([4.5, 45.4])
    useAppStore.getState().addDrawPoint([4.51, 45.4])

    // Sans ce préalable, la suite passerait au vert sur un tracé jamais né.
    const avant = useAppStore.getState()
    expect(avant.drawWaypoints).toHaveLength(2)
    expect(avant.drawPath.length).toBeGreaterThan(1)

    await useAppStore.getState().loadZone('loire')

    const apres = useAppStore.getState()
    expect(apres.zoneKey).toBe('loire')
    expect(apres.drawWaypoints).toEqual([])
    expect(apres.drawWaypointKeys).toEqual([])
    expect(apres.drawPath).toEqual([])
    expect(apres.drawError).toBeNull()
    expect(apres.drawGainMeters).toBeNull()
    // Le geste, lui, reste : c'est le volet retenu du §2 ci-dessus.
    expect(apres.drawMode).toBe(true)
  })
})
