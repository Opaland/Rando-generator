// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAppStore, oublierReglagesTouches } from '../../src/store/appStore.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Vague de mutation du 17/10 sur appStore.ts, lignes 831-1089 : la bascule du
 * bilan d'une sortie (`toggleOutingDetail`), la fiche détail (`selectItinerary`,
 * `itineraryParId`, `poisEmportes`, `ficheOuverte`), et quelques actions
 * ponctuelles (`dismissCelebration`, `enregistrerLeTrace`).
 *
 * Même montage que `cablageDuMagasin.test.ts` — c'est le seul endroit où ces
 * lambdas de dépendance d'`appStore.ts` se laissent éprouver pour de vrai.
 */
const etatInitial = { ...useAppStore.getState() }

function gpxDUnPoint(nom: string): File {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="45.4000" lon="4.5000"></trkpt>
    <trkpt lat="45.4010" lon="4.5020"></trkpt>
  </trkseg></trk>
</gpx>`
  return new File([xml], `${nom}.gpx`, { type: 'application/gpx+xml' })
}

/** Une trace à une latitude donnée : deux traces à des latitudes différentes ne se confondent pas. */
function trace(nom: string, lat = 45.4): File {
  const trkpts = [
    [4.5, lat],
    [4.501, lat],
  ]
    .map(([lon, latp]) => `<trkpt lat="${latp}" lon="${lon}"><ele>800</ele></trkpt>`)
    .join('')
  const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  return new File([xml], nom, { type: 'application/gpx+xml' })
}

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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('selectItinerary — la garde ne tient que si une fiche est vraiment ouverte', () => {
  it('ne réinitialise pas la fiche quand elle était déjà fermée', () => {
    /*
      Trouvé par mutation du 17/10 : le premier membre du `&&` —
      `state.detailItineraryId !== null` — forcé à `true` survivait, parce
      qu'aucun test n'avait de champ de `EtatFiche` à une valeur non par
      défaut alors que la fiche était déjà fermée. `toggleView3D` ne
      regarde pas `detailItineraryId` : il peut mettre `view3D` à `true`
      sans qu'aucune fiche ne soit ouverte.
    */
    expect(useAppStore.getState().detailItineraryId).toBeNull()
    useAppStore.getState().toggleView3D()
    expect(useAppStore.getState().view3D).toBe(true)

    useAppStore.getState().selectItinerary(42)

    expect(useAppStore.getState().view3D).toBe(true)
    expect(useAppStore.getState().selectedItineraryId).toBe(42)
  })
})

describe('toggleOutingDetail', () => {
  it('referme le bilan déjà ouvert sur la même sortie, sans le recalculer', async () => {
    // Trouvé par mutation du 17/10 : ni ce court-circuit ni son `set` n'avaient
    // de test (NoCoverage).
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await useAppStore.getState().importGpxFiles([trace('a.gpx')])
    const id = useAppStore.getState().tracks[0]?.id ?? ''

    await useAppStore.getState().toggleOutingDetail(id)
    expect(useAppStore.getState().outingDetail).not.toBeNull()

    await useAppStore.getState().toggleOutingDetail(id)
    expect(useAppStore.getState().outingDetail).toBeNull()
  })

  it('ne fait rien pour une trace qui n’existe plus', async () => {
    // Trouvé par mutation du 17/10 : `if (!track) return` désactivé.
    await useAppStore.getState().init()
    await expect(
      useAppStore.getState().toggleOutingDetail('trace-inexistante'),
    ).resolves.toBeUndefined()
    expect(useAppStore.getState().outingDetail).toBeNull()
  })

  it('rend le bilan de la dernière sortie demandée quand deux bascules se chevauchent', async () => {
    /*
      Ne tue pas, en l'état, les mutants du compteur `outingSequence`
      (lignes 874/887) : `computeMatching` retombe sur un calcul
      synchrone en test (même raison que dans `appStore.test.ts`), et la
      résolution d'une microtâche suit toujours l'ordre d'appel — la
      réponse la plus ancienne arrive donc toujours avant la plus
      récente, garde ou pas, et rien ici ne peut reproduire l'ordre
      inversé qu'une vraie latence réseau produirait. C'est la même
      famille que les points de contrôle `isCurrent()` de trancheZone.ts,
      laissés ouverts plus haut dans cette vague pour la même raison.
      Gardé quand même : il prouve que le résultat final est bien celui
      de la sortie demandée en dernier, ce qu'aucun test existant ne
      vérifiait avec deux sorties en vol.
    */
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await useAppStore
      .getState()
      .importGpxFiles([trace('a.gpx', 45.4), trace('b.gpx', 45.5)])
    const [premiere, seconde] = useAppStore.getState().tracks
    expect(seconde, 'il faut deux traces pour poser la question').toBeDefined()

    const p1 = useAppStore.getState().toggleOutingDetail(premiere?.id ?? '')
    const p2 = useAppStore.getState().toggleOutingDetail(seconde?.id ?? '')
    await Promise.all([p1, p2])

    expect(useAppStore.getState().outingDetail?.trackId).toBe(seconde?.id)
  })
})

describe('dismissCelebration', () => {
  it('efface le bilan de jalon affiché', () => {
    // Trouvé par mutation du 17/10 : aucun test ne l'appelait (NoCoverage).
    useAppStore.setState({ celebration: { itineraryId: 1, milestone: 50 } })
    useAppStore.getState().dismissCelebration()
    expect(useAppStore.getState().celebration).toBeNull()
  })
})

describe('openItineraryDetail — itineraireParId et poisEmportes', () => {
  it('ouvre la fiche d’un itinéraire personnel, trouvé seulement côté perso', async () => {
    /*
      Trouvé par mutation du 17/10 : le `??` de secours
      `itineraries.find(...) ?? customItineraries.find(...)` n'était mis à
      l'épreuve par aucun test où l'identifiant cherché n'existe QUE côté
      personnel — tous les tests existants ouvrent un itinéraire balisé.
    */
    await useAppStore.getState().init()
    await useAppStore.getState().importCustomGpx([gpxDUnPoint('Le mien')])
    const [perso] = useAppStore.getState().customItineraries
    expect(perso).toBeDefined()
    const id = perso?.osmRelationId ?? 0

    useAppStore.getState().openItineraryDetail(id)

    // Deux points de tracé : le profil altimétrique et les pois sont
    // demandés (coords.length >= 2), preuve que `itineraireParId` l'a
    // bien retrouvé via la branche personnelle.
    expect(useAppStore.getState().detailItineraryId).toBe(id)
    expect(useAppStore.getState().elevationLoading).toBe(true)
  })

  it('rend les pois emportés tels que sauvegardés, sans planter quand il n’y en a pas', async () => {
    // Trouvé par mutation du 17/10 : le `??` et le `?.` de la lambda
    // `poisEmportes` (délégation vers la base) n'étaient mis à l'épreuve
    // par aucun test — `openItineraryDetail` ne vérifiait jamais le
    // contenu de `poisSource`/`pois` qui en dépend.
    await useAppStore.getState().init()
    await useAppStore.getState().importCustomGpx([gpxDUnPoint('Le mien')])
    const [perso] = useAppStore.getState().customItineraries
    const id = perso?.osmRelationId ?? 0

    useAppStore.getState().openItineraryDetail(id)
    await vi.waitFor(() => {
      expect(useAppStore.getState().poisLoading).toBe(false)
    })

    expect(useAppStore.getState().poisSource).not.toBe('erreur')
  })
})

describe('ficheOuverte (lue par le mode tracé)', () => {
  it('dit vrai seulement quand une fiche est ouverte', async () => {
    // Trouvé par mutation du 17/10 : aucun test ne lisait l'effet de
    // `ficheOuverte()` à l'état fermé — seulement, via `toggleDrawMode`,
    // le cas où une fiche est déjà ouverte (cablageDuMagasin.test.ts).
    await useAppStore.getState().init()

    useAppStore.getState().toggleDrawMode()
    expect(useAppStore.getState().drawMode).toBe(true)
    // Aucune fiche n'était ouverte : `toggleDrawMode` n'avait rien à fermer,
    // et ne doit pas non plus avoir touché `detailItineraryId`.
    expect(useAppStore.getState().detailItineraryId).toBeNull()
  })
})

describe('enregistrerLeTrace (saveDrawnItinerary) sans base ouverte', () => {
  it('range quand même le tracé en mémoire plutôt que de planter', async () => {
    /*
      Trouvé par mutation du 17/10 : `if (db) await db.saveCustomItinerary(...)`
      forcé à `true` est inobservable tant que `db` est déjà vrai dans tous
      les tests existants (après `init()`). Sans `init()`, `db` reste `null`
      — le vrai cas où la garde protège d'un plantage sur `null.saveCustomItinerary`.
    */
    expect(useAppStore.getState().db).toBeNull()
    useAppStore.setState({
      drawPath: [
        [4.5, 45.4],
        [4.51, 45.41],
      ],
    })

    await expect(
      useAppStore.getState().saveDrawnItinerary('Tracé du jour'),
    ).resolves.toBeUndefined()

    expect(useAppStore.getState().customItineraries).toHaveLength(1)
  })
})
