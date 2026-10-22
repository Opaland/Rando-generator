// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore, oublierReglagesTouches } from '../../src/store/appStore.ts'
import { openSentiersDb } from '../../src/db/database.ts'
import type { Itinerary } from '../../src/core/types.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Aucun identifiant perso n'est distribué deux fois (#543).
 *
 * L'issue décrivait un seul chemin — deux imports pendant le démarrage — et
 * le rangeait en « question de produit ». En relisant, il y en avait quatre,
 * et tous avaient la même cause : quatre fonctions distribuaient des
 * identifiants négatifs, chacune à partir de ce qu'elle voyait au moment où
 * elle regardait, et aucune ne savait ce que les autres venaient de donner.
 *
 *   - le tracé dessiné réutilisait son numéro de relation comme numéro de
 *     chemin, alors que l'import numérote ses chemins à part : le premier
 *     tracé après un import à plusieurs tronçons tombait sur un chemin
 *     importé ;
 *   - un import prenait un instantané au départ et comptait dessous ; un
 *     second import, ou un tracé, pendant ce temps-là repartait du même ;
 *   - pendant l'ouverture de la base, la mémoire est vide : l'import
 *     distribuait −1 même quand la base l'avait déjà, et le `put` écrasait ;
 *   - la restauration d'une sauvegarde renumérotait les chemins par
 *     `id * 1 000 − index`, la formule retirée de l'import par #440, et
 *     gardait sans les regarder ceux d'un itinéraire au numéro libre.
 *
 * `osmWayId` est une clef de carte sur tous les itinéraires d'un rendu
 * (identifiantsDeCheminImportes.test.ts dit ce que coûte un doublon) ; un
 * `osmRelationId` en double est un itinéraire écrasé en base.
 */

const etatInitial = { ...useAppStore.getState() }

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.includes('interpreter')
          ? new Response(JSON.stringify(pilat), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response('', { status: 404 }),
      ),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Une ligne à deux points, décalée pour que deux fichiers ne se ressemblent pas. */
const ligne = (n: number): [number, number][] => [
  [4.6 + n * 1e-4, 45.4],
  [4.6 + n * 1e-4 + 1e-4, 45.4],
]

/** Un GeoJSON d'un seul tracé à `troncons` parties. */
function geojson(nom: string, depart: number, troncons: number): File {
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: nom },
        geometry: {
          type: 'MultiLineString',
          coordinates: Array.from({ length: troncons }, (_, i) =>
            ligne(depart + i),
          ),
        },
      },
    ],
  }
  return new File([JSON.stringify(geo)], `${nom}.geojson`, {
    type: 'application/geo+json',
  })
}

function doublons(ids: number[]): number[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i)
}

function relations(itineraires: Itinerary[]): number[] {
  return itineraires.map((i) => i.osmRelationId)
}

function chemins(itineraires: Itinerary[]): number[] {
  return itineraires.flatMap((i) => i.ways.map((w) => w.osmWayId))
}

describe('un tracé dessiné après un import', () => {
  it('ne reprend le numéro d’aucun chemin importé', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().importCustomGpx([geojson('Réseau', 0, 3)])
    await useAppStore.getState().loadZone('pilat')
    const sommets = useAppStore.getState().itineraries[0]?.ways[0]?.coords ?? []
    expect(sommets.length, 'il faut un sentier où cliquer').toBeGreaterThan(1)

    useAppStore.getState().toggleDrawMode()
    useAppStore.getState().addDrawPoint(sommets[0] as [number, number])
    useAppStore.getState().addDrawPoint(sommets[1] as [number, number])
    await useAppStore.getState().saveDrawnItinerary('Ma boucle')

    const persos = useAppStore.getState().customItineraries
    expect(persos).toHaveLength(2)
    expect(
      doublons(chemins(persos)),
      'le tracé portait le numéro de chemin d’un tronçon importé : la carte' +
        ' dessinait l’un avec les coordonnées de l’autre.',
    ).toEqual([])
  })
})

describe('deux imports lancés ensemble', () => {
  it('ne se donnent ni la même relation ni le même chemin', async () => {
    await useAppStore.getState().init()
    await Promise.all([
      useAppStore.getState().importCustomGpx([geojson('Premier', 0, 2)]),
      useAppStore.getState().importCustomGpx([geojson('Second', 100, 2)]),
    ])

    const persos = useAppStore.getState().customItineraries
    expect(persos.map((i) => i.name).sort()).toEqual(['Premier', 'Second'])
    expect(doublons(relations(persos))).toEqual([])
    expect(doublons(chemins(persos))).toEqual([])

    // Et la base garde les deux : un `put` sur le même numéro en effaçait un.
    const enBase = await useAppStore.getState().db!.listCustomItineraries()
    expect(enBase.map((i) => i.name).sort()).toEqual(['Premier', 'Second'])
  })
})

describe('un import pendant l’ouverture de la base', () => {
  it('n’écrase pas l’itinéraire que la base porte déjà sous −1', async () => {
    // Session précédente : un itinéraire importé, en base sous −1.
    const avant = await openSentiersDb()
    await avant.saveCustomItinerary({
      osmRelationId: -1,
      ref: null,
      name: 'Déjà là',
      network: 'PERSO',
      ways: [{ osmWayId: -1, coords: ligne(500) }],
      totalMeters: 10,
      fetchedAt: '2026-10-01T00:00:00.000Z',
      importe: true,
    })

    // Nouvelle session : on dépose un fichier avant que la base soit lue.
    const demarrage = useAppStore.getState().init()
    const depot = useAppStore.getState().importCustomGpx([geojson('Neuf', 0, 1)])
    await Promise.all([demarrage, depot])

    const noms = useAppStore
      .getState()
      .customItineraries.map((i) => i.name)
      .sort()
    expect(noms, 'l’un des deux avait disparu de la liste').toEqual([
      'Déjà là',
      'Neuf',
    ])
    const enBase = await useAppStore.getState().db!.listCustomItineraries()
    expect(
      enBase.map((i) => i.name).sort(),
      'l’import avait écrit sous −1 par-dessus l’itinéraire de la session précédente',
    ).toEqual(['Déjà là', 'Neuf'])
    expect(doublons(chemins(useAppStore.getState().customItineraries))).toEqual(
      [],
    )
  })
})

describe('quand la base ne s’ouvre pas', () => {
  it('l’import n’attend pas à vie une lecture qui ne viendra jamais', async () => {
    // Navigation privée de certains navigateurs : pas d'IndexedDB.
    vi.stubGlobal('indexedDB', undefined)
    await useAppStore.getState().init()
    expect(useAppStore.getState().dbWarning).not.toBeNull()

    await useAppStore.getState().importCustomGpx([geojson('Sans base', 0, 1)])
    expect(useAppStore.getState().customItineraries.map((i) => i.name)).toEqual([
      'Sans base',
    ])
  })
})
