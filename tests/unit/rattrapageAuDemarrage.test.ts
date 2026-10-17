// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore, oublierReglagesTouches } from '../../src/store/appStore.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Le rattrapage d'`init` (task #36, vague de mutation sur appStore.ts).
 *
 * Trois choses se disputent la même fenêtre — la base qui s'ouvre, et ce que
 * la personne fait pendant ce temps : déclarer un itinéraire fait, déposer
 * une trace, importer un tracé perso. `init` fusionne plutôt que remplace
 * dans les trois cas, par le même motif de dédoublonnage répété trois fois.
 * Aucun des trois n'était mis à l'épreuve d'un doublon réel.
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

describe('init — fusion des itinéraires déclarés avec ce que la base contient', () => {
  it('garde la déclaration faite pendant la course, et ajoute ce que la base avait déjà', async () => {
    /*
      Trouvé par mutation du 17/10 : la fusion de `parcoursDeclares`
      (`etat.parcoursDeclares` + ce que la base contient, sans les ids déjà
      présents) n'était mise à l'épreuve par aucun test avec un id
      réellement en double entre les deux côtés — ni avec un id présent
      d'un seul côté. Sans un id commun ET un id propre à chaque côté, le
      filtre peut disparaître, ou `.some` devenir `.every`, sans qu'aucun
      test ne le remarque.
    */
    await useAppStore.getState().init()
    // Session précédente : 5 et 9 déjà déclarés, et persistés.
    await useAppStore.getState().declarerParcours(5, '2026-01-01')
    await useAppStore.getState().declarerParcours(9, '2026-01-02')

    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()

    // Nouvelle session : la base se rouvre, et pendant ce temps-là la
    // personne redéclare 5 (nouvelle date) et déclare 7 (nouveau).
    const demarrage = useAppStore.getState().init()
    await useAppStore.getState().declarerParcours(5, '2026-03-03')
    await useAppStore.getState().declarerParcours(7, '2026-03-04')
    await demarrage

    const declares = useAppStore.getState().parcoursDeclares
    expect(declares).toHaveLength(3)
    expect(declares.find((d) => d.itineraryId === 5)?.date).toBe('2026-03-03')
    expect(declares.map((d) => d.itineraryId).sort((a, b) => a - b)).toEqual([5, 7, 9])
  })
})

describe('init — rattrapage des traces déposées pendant l’ouverture de la base', () => {
  it('écrit en base seulement la trace qui n’y était pas, pas celle déjà présente', async () => {
    /*
      Trouvé par mutation du 17/10 : `idsEnBase`/`aEcrire` (lignes 745-758)
      n'étaient mis à l'épreuve par AUCUN test — `importGpxFiles` persiste
      lui-même la trace dès que la base est ouverte (ce qui est quasi
      immédiat avec `fake-indexeddb`), si bien qu'une trace importée
      « pendant la course » via `importGpxFiles` ne passe jamais par ce
      filet de rattrapage : il ne sert que si une trace s'est retrouvée en
      mémoire sans jamais être écrite — construit ici directement, et avec
      une seconde trace déjà en base pour distinguer « ne filtre rien » de
      « filtre correctement ».
    */
    await useAppStore.getState().init()
    const db0 = useAppStore.getState().db!
    const trackA = {
      id: 'deja-en-base',
      filename: 'deja-en-base.gpx',
      points: [[4.5, 45.4], [4.501, 45.4]] as [number, number][],
      date: null,
      importedAt: '2026-01-01T00:00:00Z',
    }
    await db0.saveTrack(trackA)

    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
    const trackB = {
      id: 'memoire-seule',
      filename: 'memoire-seule.gpx',
      points: [[4.6, 45.5], [4.601, 45.5]] as [number, number][],
      date: null,
      importedAt: '2026-01-01T00:00:00Z',
    }
    useAppStore.setState({ tracks: [trackB] })

    await useAppStore.getState().init()

    const db = useAppStore.getState().db!
    const enBase = (await db.listTracks()).map((t) => t.id).sort()
    expect(enBase).toEqual(['deja-en-base', 'memoire-seule'])
  })

  it('ne ré-écrit pas une trace déjà en base au prochain démarrage', async () => {
    await useAppStore.getState().init()
    useAppStore.setState({
      tracks: [
        {
          id: 'memoire-seule',
          filename: 'memoire-seule.gpx',
          points: [[4.5, 45.4], [4.501, 45.4]],
          date: null,
          importedAt: '2026-01-01T00:00:00Z',
        },
      ],
    })
    await useAppStore.getState().init()

    const db = useAppStore.getState().db!
    const espion = vi.spyOn(db, 'saveTrack')
    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
    await useAppStore.getState().init()
    expect(espion).not.toHaveBeenCalled()
  })
})

describe('init — rattrapage des itinéraires personnels qui n’existaient qu’en mémoire', () => {
  it('écrit en base seulement l’itinéraire perso qui n’y était pas, pas celui déjà présent', async () => {
    // Même motif que pour les traces (lignes 759-770), côté itinéraires
    // personnels : un itinéraire déjà en base (id 100) pour que le filtre
    // ait quelque chose à exclure, et un second qui n'existe qu'en mémoire.
    await useAppStore.getState().init()
    const db0 = useAppStore.getState().db!
    await db0.saveCustomItinerary({
      osmRelationId: 100,
      ref: null,
      name: 'Déjà en base',
      network: 'PERSO',
      ways: [{ osmWayId: -100, coords: [[4.5, 45.4], [4.501, 45.4]] }],
      totalMeters: 100,
      fetchedAt: '2026-01-01T00:00:00Z',
    })

    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
    useAppStore.setState({
      customItineraries: [
        {
          osmRelationId: -1,
          ref: null,
          name: 'Mémoire seule',
          network: 'PERSO',
          ways: [{ osmWayId: -1, coords: [[4.6, 45.5], [4.601, 45.5]] }],
          totalMeters: 100,
          fetchedAt: '2026-01-01T00:00:00Z',
        },
      ],
    })

    await useAppStore.getState().init()

    const db = useAppStore.getState().db!
    const idsEnBase = (await db.listCustomItineraries()).map((i) => i.osmRelationId).sort((a, b) => a - b)
    expect(idsEnBase).toEqual([-1, 100])
  })

  it('ne ré-écrit pas un itinéraire perso déjà en base au prochain démarrage', async () => {
    await useAppStore.getState().init()
    useAppStore.setState({
      customItineraries: [
        {
          osmRelationId: -1,
          ref: null,
          name: 'Mémoire seule',
          network: 'PERSO',
          ways: [{ osmWayId: -1, coords: [[4.6, 45.5], [4.601, 45.5]] }],
          totalMeters: 100,
          fetchedAt: '2026-01-01T00:00:00Z',
        },
      ],
    })
    await useAppStore.getState().init()

    const db = useAppStore.getState().db!
    const espion = vi.spyOn(db, 'saveCustomItinerary')
    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
    await useAppStore.getState().init()
    expect(espion).not.toHaveBeenCalled()
  })
})

describe('declarerParcours — ne touche qu’à sa propre déclaration', () => {
  it('ne retire pas les déclarations des autres itinéraires en la remplaçant', async () => {
    /*
      Trouvé par mutation du 17/10 : les deux seuls tests existants ne
      déclaraient jamais le même id deux fois en présence d'un AUTRE id —
      un filtre qui viderait tout (`() => undefined`) donnait donc le même
      résultat qu'un filtre correct.
    */
    await useAppStore.getState().declarerParcours(42, '2026-01-01')
    await useAppStore.getState().declarerParcours(7, '2026-01-02')
    await useAppStore.getState().declarerParcours(42, '2026-02-02')

    const declares = useAppStore.getState().parcoursDeclares
    expect(declares.map((d) => d.itineraryId).sort((a, b) => a - b)).toEqual([7, 42])
    expect(declares.find((d) => d.itineraryId === 42)?.date).toBe('2026-02-02')
  })
})

describe('init — la zone en cache ne se restaure pas pendant une démonstration', () => {
  it('ne restaure pas la dernière zone quand la démonstration est active', async () => {
    /*
      Trouvé par mutation du 17/10 : la garde `typeof lastZoneKey ===
      'string' && !get().demonstration` n'était mise à l'épreuve que du
      côté « pas de démonstration » (ailleurs dans ce fichier) — jamais du
      côté où la démonstration doit au contraire empêcher la restauration.
    */
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')

    useAppStore.setState({ ...etatInitial, demonstration: true }, true)

    await useAppStore.getState().init()
    expect(useAppStore.getState().zoneKey).toBeNull()
    expect(useAppStore.getState().zoneRestoredAtStartup).toBe(false)
  })
})
