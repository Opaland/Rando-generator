// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { useAppStore, MIN_TOLERANCE, MAX_TOLERANCE } from '../../src/store/appStore.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }
import { buildZip, gzip } from '../fixtures/zip.ts'
import { buildBackup, serialiserBackup } from '../../src/core/backup.ts'

/**
 * Tests du store (issue #9). Sa logique est riche et n'était couverte que par
 * les e2e : cache et forçage de zone, repli sur un cache périmé, séquencement
 * des chargements concurrents, dédoublonnage à l'import, bornage de la
 * tolérance. Autant de comportements qu'un test de bout en bout ne peut
 * vérifier qu'indirectement, et lentement.
 *
 * Les workers n'existent pas ici : computeMatching retombe sur le calcul
 * synchrone, ce qui rend les assertions déterministes.
 */

/** État initial capturé à l'import : les actions, elles, ne changent pas. */
const etatInitial = { ...useAppStore.getState() }

function fichierGpx(nom: string, points: [number, number][], date?: string): File {
  const trkpts = points
    .map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"><ele>800</ele></trkpt>`)
    .join('')
  const metadata = date ? `<metadata><time>${date}</time></metadata>` : ''
  const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${metadata}<trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  return new File([xml], nom, { type: 'application/gpx+xml' })
}

function ligne(n: number, lat = 45.4): [number, number][] {
  return Array.from({ length: n }, (_, i) => [4.5 + i * 0.001, lat])
}

/** Réponse Overpass mockée, au format attendu par fetchOverpass. */
function reponseOverpass(corps: unknown = pilat): Response {
  return new Response(JSON.stringify(corps), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Signature réduite de fetch, telle que l'appelle core/overpass. */
type FetchMocke = (url: string, init?: { body?: string }) => Promise<Response>

let fetchMock: Mock<FetchMocke>

beforeEach(() => {
  // Une fabrique IndexedDB neuve par test : c'est le seul isolement fiable,
  // supprimer la base ne suffit pas — une connexion laissée ouverte par un
  // init() précédent bloque la suppression indéfiniment.
  vi.stubGlobal('indexedDB', new IDBFactory())
  useAppStore.setState(etatInitial, true)
  fetchMock = vi.fn<FetchMocke>((url) =>
    url.includes('interpreter')
      ? Promise.resolve(reponseOverpass())
      : // Boucles locales embarquées : absentes en test, l'app doit s'en passer.
        Promise.resolve(new Response('', { status: 404 })),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('init', () => {
  it('met en cache une zone chargée pendant le démarrage', async () => {
    // Même course que pour les traces : la base s'ouvre pendant que
    // l'utilisateur clique. Sans cache, la visite suivante repart pour deux
    // minutes d'interrogation d'Overpass au lieu de restaurer sa zone.
    const demarrage = useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await demarrage

    const db = useAppStore.getState().db
    expect(await db?.getZone('pilat')).toBeTruthy()
    expect(await db?.getSetting('lastZoneKey')).toBe('pilat')
  })

  it('ne perd pas une trace importée pendant le démarrage', async () => {
    // L'utilisateur dépose un GPX avant que la lecture d'IndexedDB soit
    // terminée — quelques centaines de millisecondes, largement atteignables
    // sur un téléphone. La restauration écrasait alors la liste : la trace
    // disparaissait sans un mot, et un second dépôt du même fichier n'était
    // même plus détecté comme doublon.
    const demarrage = useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('pendant-le-demarrage.gpx', ligne(10))])
    await demarrage

    const noms = useAppStore.getState().tracks.map((t) => t.filename)
    expect(noms).toContain('pendant-le-demarrage.gpx')
  })

  it('conserve la trace déposée au démarrage jusque dans la base', async () => {
    const demarrage = useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('pendant-le-demarrage.gpx', ligne(10))])
    await demarrage

    // Persistée, et pas seulement affichée : au rechargement suivant, elle
    // doit encore être là.
    const db = useAppStore.getState().db
    const enBase = await db?.listTracks()
    expect(enBase?.map((t) => t.filename)).toContain(
      'pendant-le-demarrage.gpx',
    )
  })

  it('refuse encore le doublon d’une trace déposée au démarrage', async () => {
    const demarrage = useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(10))])
    await demarrage
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie-copie.gpx', ligne(10))])

    expect(useAppStore.getState().importErrors.join(' ')).toMatch(/identique/)
    expect(useAppStore.getState().tracks).toHaveLength(1)
  })

  it('ouvre la base et restaure les réglages sans toucher au réseau', async () => {
    await useAppStore.getState().init()
    expect(useAppStore.getState().db).not.toBeNull()
    expect(useAppStore.getState().dbWarning).toBeNull()
    // Aucune requête Overpass au démarrage : le réseau ne part jamais tout seul.
    expect(
      fetchMock.mock.calls.filter(([url]) => url.includes('interpreter')),
    ).toHaveLength(0)
  })

  it('restaure les traces et la tolérance enregistrées', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().importGpxFiles([fichierGpx('a.gpx', ligne(20))])
    await useAppStore.getState().setTolerance(80)

    useAppStore.setState(etatInitial, true)
    await useAppStore.getState().init()
    expect(useAppStore.getState().tracks).toHaveLength(1)
    expect(useAppStore.getState().toleranceMeters).toBe(80)
  })

  it('restaure la dernière zone depuis le cache, sans requête réseau', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const appels = fetchMock.mock.calls.length

    useAppStore.setState(etatInitial, true)
    await useAppStore.getState().init()
    expect(useAppStore.getState().zoneKey).toBe('pilat')
    expect(useAppStore.getState().itineraries.length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBe(appels)
  })
})

describe('loadZone', () => {
  it('affiche les octets reçus, puis remet le compteur à zéro', async () => {
    // Deux minutes d'attente sans rien qui bouge, et l'utilisateur recharge :
    // le compteur d'octets est le seul signal honnête dont on dispose.
    const brut = new TextEncoder().encode(JSON.stringify(pilat))
    const vus: number[] = []
    fetchMock.mockImplementation(
      (url) =>
        new Promise<Response>((resolve) => {
          if (!url.includes('interpreter')) {
            resolve(new Response('{}', { status: 200 }))
            return
          }
          const flux = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(brut.slice(0, 50))
              vus.push(useAppStore.getState().zoneLoadBytes)
              controller.enqueue(brut.slice(50))
              controller.close()
            },
          })
          resolve(new Response(flux, { status: 200 }))
        }),
    )

    const desabonner = useAppStore.subscribe((etat) => {
      if (etat.zoneLoading && etat.zoneLoadBytes > 0) vus.push(etat.zoneLoadBytes)
    })
    await useAppStore.getState().loadZone('pilat')
    desabonner()

    expect(vus).toContain(50)
    expect(vus).toContain(brut.byteLength)
    // Le chargement terminé, le compteur ne doit pas rester affiché.
    expect(useAppStore.getState().zoneLoadBytes).toBe(0)
    expect(useAppStore.getState().zoneLoading).toBe(false)
  })

  it('charge une zone, la met en cache et calcule la progression', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const etat = useAppStore.getState()
    expect(etat.zoneKey).toBe('pilat')
    expect(etat.zoneLabel).toBe('PNR du Pilat')
    expect(etat.itineraries).toHaveLength(3)
    expect(etat.zoneLoading).toBe(false)
    expect(etat.zoneError).toBeNull()
    expect(etat.matching?.global.pct).toBe(0)
  })

  it('réutilise le cache au second chargement', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const appels = fetchMock.mock.calls.length
    await useAppStore.getState().loadZone('pilat')
    expect(fetchMock.mock.calls.length).toBe(appels)
  })

  it('« Actualiser les tracés » force une nouvelle requête', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const appels = fetchMock.mock.calls.length
    await useAppStore.getState().loadZone('pilat', { force: true })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(appels)
  })

  it('retombe sur le cache périmé quand les miroirs sont injoignables', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const db = useAppStore.getState().db
    const cache = await db?.getZone('pilat')
    // On vieillit le cache au-delà de sa durée de vie : au prochain
    // chargement, l'application ira interroger Overpass.
    if (cache) {
      await db?.saveZone({ ...cache, fetchedAt: '2020-01-01T00:00:00Z' })
    }

    fetchMock.mockImplementation(() => Promise.reject(new Error('réseau coupé')))
    await useAppStore.getState().loadZone('pilat')

    const etat = useAppStore.getState()
    // Les tracés restent affichés — et l'utilisateur est prévenu qu'ils datent.
    expect(etat.itineraries).toHaveLength(3)
    expect(etat.zoneError).toMatch(/injoignables/i)
    expect(etat.zoneLoading).toBe(false)
  })

  it('explique l’échec quand il n’y a rien en cache', async () => {
    await useAppStore.getState().init()
    fetchMock.mockImplementation(() => Promise.reject(new Error('réseau coupé')))
    await useAppStore.getState().loadZone('pilat')

    const etat = useAppStore.getState()
    expect(etat.itineraries).toHaveLength(0)
    expect(etat.zoneError).toBeTruthy()
    // L'interface ne reste jamais bloquée en chargement.
    expect(etat.zoneLoading).toBe(false)
    expect(etat.zoneLoadStage).toBeNull()
  })

  it('le dernier chargement demandé gagne, même s’il répond en dernier', async () => {
    await useAppStore.getState().init()
    // La requête de la Loire répond volontairement après celle du Pilat :
    // c'est le cas qui piège, le chargement abandonné revient et pourrait
    // réécrire l'écran. Les deux zones se distinguent par leur requête.
    fetchMock.mockImplementation((url, init) => {
      if (!url.includes('interpreter')) {
        return Promise.resolve(new Response('', { status: 404 }))
      }
      if ((init?.body ?? '').includes('Loire')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(reponseOverpass({ elements: [] }))
          }, 60)
        })
      }
      return Promise.resolve(reponseOverpass())
    })

    // L'ordre des appels est déterministe : loadZone incrémente son numéro de
    // séquence avant toute attente.
    const premier = useAppStore.getState().loadZone('loire')
    const second = useAppStore.getState().loadZone('pilat')
    await Promise.all([second, premier])

    const etat = useAppStore.getState()
    expect(etat.zoneKey).toBe('pilat')
    expect(etat.itineraries).toHaveLength(3)
    expect(etat.zoneLoading).toBe(false)
  })

  it('ignore une zone inconnue plutôt que de planter', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('atlantide')
    expect(useAppStore.getState().zoneKey).toBeNull()
  })
})

describe('importGpxFiles', () => {
  it('importe une trace et en déduit le dénivelé', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(20), '2026-05-01T08:00:00Z')])
    const [trace] = useAppStore.getState().tracks
    expect(trace?.filename).toBe('sortie.gpx')
    expect(trace?.date).toBe('2026-05-01T08:00:00Z')
    expect(trace?.points).toHaveLength(20)
    expect(trace?.elevationGain).toBe(0)
  })

  it('refuse une trace identique à une trace déjà importée', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().importGpxFiles([fichierGpx('a.gpx', ligne(20))])
    await useAppStore.getState().importGpxFiles([fichierGpx('copie.gpx', ligne(20))])
    expect(useAppStore.getState().tracks).toHaveLength(1)
    expect(useAppStore.getState().importErrors.join()).toMatch(/identique à/)
  })

  it('signale un fichier sans point exploitable sans perdre les autres', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vide.gpx', []), fichierGpx('bonne.gpx', ligne(20))])
    expect(useAppStore.getState().tracks).toHaveLength(1)
    expect(useAppStore.getState().importErrors.join()).toMatch(/vide\.gpx/)
  })

  it('signale un fichier illisible avec son nom', async () => {
    await useAppStore.getState().init()
    const casse = new File(['pas du tout du XML'], 'casse.gpx')
    await useAppStore.getState().importGpxFiles([casse])
    expect(useAppStore.getState().tracks).toHaveLength(0)
    expect(useAppStore.getState().importErrors.join()).toMatch(/casse\.gpx/)
  })

  it('remet l’avancement à zéro une fois le lot terminé', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('a.gpx', ligne(20)), fichierGpx('b.gpx', ligne(20, 45.5))])
    expect(useAppStore.getState().importProgress).toBeNull()
    expect(useAppStore.getState().tracks).toHaveLength(2)
  })
})

describe('setTolerance', () => {
  it('borne la valeur au lieu de la refuser', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setTolerance(5)
    expect(useAppStore.getState().toleranceMeters).toBe(MIN_TOLERANCE)
    await useAppStore.getState().setTolerance(500)
    expect(useAppStore.getState().toleranceMeters).toBe(MAX_TOLERANCE)
  })

  it('recalcule la progression avec la nouvelle tolérance', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    // Une trace qui longe le GR 7 à 15 m au nord (fixture : lat 45.4).
    await useAppStore
      .getState()
      .importGpxFiles([
        fichierGpx('gr7.gpx', ligne(40, 45.4 + 15 / 111_195).map(([lon]) => [lon, 45.4 + 15 / 111_195])),
      ])
    await useAppStore.getState().setTolerance(MAX_TOLERANCE)
    const large = useAppStore.getState().matching?.global.pct ?? 0
    await useAppStore.getState().setTolerance(MIN_TOLERANCE)
    const serre = useAppStore.getState().matching?.global.pct ?? 0
    expect(large).toBeGreaterThan(0)
    expect(serre).toBeLessThan(large)
  })
})

describe('removeTrack', () => {
  it('supprime la trace et recalcule', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('gr7.gpx', ligne(40))])
    expect(useAppStore.getState().matching?.global.pct).toBeGreaterThan(0)

    const id = useAppStore.getState().tracks[0]?.id ?? ''
    await useAppStore.getState().removeTrack(id)
    expect(useAppStore.getState().tracks).toHaveLength(0)
    expect(useAppStore.getState().matching?.global.pct).toBe(0)
  })
})

describe('selectItinerary', () => {
  it('ferme une fiche détail ouverte pour un autre itinéraire', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const [premier, second] = useAppStore.getState().itineraries
    useAppStore.getState().openItineraryDetail(premier?.osmRelationId ?? 0)
    expect(useAppStore.getState().detailItineraryId).toBe(premier?.osmRelationId)

    useAppStore.getState().selectItinerary(second?.osmRelationId ?? 0)
    // La fiche n'a plus de sujet cohérent : elle se ferme.
    expect(useAppStore.getState().detailItineraryId).toBeNull()
    expect(useAppStore.getState().selectedItineraryId).toBe(second?.osmRelationId)
  })

  it('garde la fiche ouverte quand on resélectionne le même itinéraire', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const [premier] = useAppStore.getState().itineraries
    const id = premier?.osmRelationId ?? 0
    useAppStore.getState().openItineraryDetail(id)
    useAppStore.getState().selectItinerary(id)
    expect(useAppStore.getState().detailItineraryId).toBe(id)
  })
})

describe('annonces et bilans, cycle de vie', () => {
  it('l’annonce d’un jalon tient jusqu’à ce qu’elle cesse d’être vraie', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    // Tolérance serrée : la trace ne crédite rien.
    await useAppStore.getState().setTolerance(MIN_TOLERANCE)
    await useAppStore
      .getState()
      .importGpxFiles([
        fichierGpx('gr7.gpx', ligne(40, 45.4 + 15 / 111_195)),
      ])
    expect(useAppStore.getState().celebration).toBeNull()

    // On desserre : le GR 7 franchit ses jalons d'un coup.
    await useAppStore.getState().setTolerance(MAX_TOLERANCE)
    expect(useAppStore.getState().celebration).not.toBeNull()

    // Un calcul suivant sans nouveau franchissement ne l'efface pas : le
    // jalon reste atteint, et un recalcul de fond — démarrage, arrivée des
    // boucles locales — la faisait disparaître dans la seconde.
    await useAppStore.getState().setTolerance(MAX_TOLERANCE - 5)
    expect(useAppStore.getState().celebration).not.toBeNull()

    // Elle tombe en revanche dès qu'elle cesse d'être vraie : à tolérance
    // serrée, l'itinéraire repasse sous son jalon.
    await useAppStore.getState().setTolerance(MIN_TOLERANCE)
    expect(useAppStore.getState().celebration).toBeNull()
  })

  it('changer de zone referme le bilan d’une sortie', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('a.gpx', ligne(40))])
    const id = useAppStore.getState().tracks[0]?.id ?? ''
    await useAppStore.getState().toggleOutingDetail(id)
    expect(useAppStore.getState().outingDetail).not.toBeNull()

    await useAppStore.getState().loadZone('loire')
    // Le bilan nommait des itinéraires qui ne sont plus chargés.
    expect(useAppStore.getState().outingDetail).toBeNull()
  })
})

describe('seuil de complétion', () => {
  it('démarre à 95 % et retient le choix de l’utilisateur', async () => {
    await useAppStore.getState().init()
    expect(useAppStore.getState().completionPct).toBe(95)

    await useAppStore.getState().setCompletionPct(100)
    expect(useAppStore.getState().completionPct).toBe(100)

    const db = useAppStore.getState().db
    expect(await db?.getSetting('completionPct')).toBe(100)
  })

  it('ramène une valeur inconnue à un seuil proposé', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setCompletionPct(42)
    expect(useAppStore.getState().completionPct).toBe(90)
  })

  it('ne relance pas le calcul : le seuil ne change pas les pourcentages', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(20))])
    const avant = useAppStore.getState().matching
    await useAppStore.getState().setCompletionPct(90)
    // Même objet : rien n'a été recalculé, seul le mot posé dessus change.
    expect(useAppStore.getState().matching).toBe(avant)
  })
})

describe('archives d’export', () => {
  const gpx = (points: [number, number][]): string => {
    const trkpts = points
      .map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"><ele>800</ele></trkpt>`)
      .join('')
    return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  }

  it('importe les traces d’une archive déposée telle quelle', async () => {
    // Ce qui remplace un connecteur Strava : l'utilisateur exporte ses
    // données chez eux et dépose l'archive ici, sans rien envoyer nulle part.
    const archive = await buildZip([
      { nom: 'activities/1.gpx', contenu: gpx(ligne(10)) },
      { nom: 'activities/2.gpx.gz', contenu: await gzip(gpx(ligne(12, 45.41))), methode: 0 },
      { nom: 'profile.csv', contenu: 'nom,prenom' },
      { nom: '__MACOSX/._1.gpx', contenu: 'x', methode: 0 },
    ])
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([new File([archive], 'export.zip')])

    const noms = useAppStore.getState().tracks.map((t) => t.filename)
    // Les noms perdent leur dossier, et le .gz disparaît avec la compression.
    expect(noms).toEqual(['1.gpx', '2.gpx'])
    // Le CSV et les métadonnées macOS ne sont pas des erreurs d'import.
    expect(useAppStore.getState().importErrors).toEqual([])
  })

  it('dit clairement qu’une archive ne contient aucune trace', async () => {
    const archive = await buildZip([{ nom: 'profile.csv', contenu: 'x' }])
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([new File([archive], 'export.zip')])

    expect(useAppStore.getState().importErrors.join(' ')).toMatch(
      /aucune trace/i,
    )
    expect(useAppStore.getState().tracks).toEqual([])
  })

  it('mélange sans broncher une archive et des fichiers isolés', async () => {
    const archive = await buildZip([
      { nom: 'activities/1.gpx', contenu: gpx(ligne(10)) },
    ])
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([
        new File([archive], 'export.zip'),
        fichierGpx('a-part.gpx', ligne(14, 45.42)),
      ])

    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      '1.gpx',
      'a-part.gpx',
    ])
  })
})

describe('sauvegarde complète', () => {
  it('emporte traces, itinéraires perso et réglages, et les rend', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(12))])
    await useAppStore.getState().setTolerance(35)

    const backup = buildBackup({
      tracks: useAppStore.getState().tracks,
      customItineraries: [],
      settings: { toleranceMeters: useAppStore.getState().toleranceMeters },
      exportedAt: '2026-08-20T10:00:00Z',
    })

    // L'appareil neuf : même magasin, tout est reparti de zéro.
    vi.stubGlobal('indexedDB', new IDBFactory())
    useAppStore.setState(etatInitial, true)
    vi.stubGlobal('fetch', fetchMock)
    await useAppStore.getState().init()
    expect(useAppStore.getState().tracks).toEqual([])

    await useAppStore
      .getState()
      .importerSauvegarde(
        new File([serialiserBackup(backup)], 'sauvegarde.json'),
      )

    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      'sortie.gpx',
    ])
    expect(useAppStore.getState().toleranceMeters).toBe(35)
    expect(useAppStore.getState().backupMessage).toMatch(/1 trace ajoutée/)
  })

  it('remet les traces restaurées en base, pas seulement en mémoire', async () => {
    await useAppStore.getState().init()
    const backup = buildBackup({
      tracks: [
        {
          id: 'venue-dailleurs',
          filename: 'ailleurs.gpx',
          points: ligne(9, 45.44),
          date: null,
          importedAt: '2026-05-01T20:00:00Z',
          elevationGain: null,
        },
      ],
      customItineraries: [],
      settings: {},
      exportedAt: '2026-08-20T10:00:00Z',
    })
    await useAppStore
      .getState()
      .importerSauvegarde(new File([serialiserBackup(backup)], 's.json'))

    // Un redémarrage relit la base : si l'écriture avait été oubliée, la
    // trace disparaîtrait au premier rechargement de page.
    useAppStore.setState(etatInitial, true)
    await useAppStore.getState().init()
    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      'ailleurs.gpx',
    ])
  })

  it('refuse un fichier étranger sans toucher aux traces déjà là', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(12))])

    await useAppStore
      .getState()
      .importerSauvegarde(new File(['{"type":"FeatureCollection"}'], 'x.json'))

    expect(useAppStore.getState().tracks).toHaveLength(1)
    expect(useAppStore.getState().importErrors.join(' ')).toMatch(
      /pas une sauvegarde/i,
    )
    expect(useAppStore.getState().backupMessage).toBeNull()
  })
})

describe('recherche de lieu', () => {
  const reponseBan = (features: unknown[]) =>
    new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  const commune = (label: string, center: [number, number]) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: center },
    properties: { label, context: '42, Loire', type: 'municipality' },
  })

  it('rend les communes trouvées', async () => {
    fetchMock.mockImplementation((url) =>
      url.includes('api-adresse')
        ? Promise.resolve(reponseBan([commune('Saint-Étienne', [4.38, 45.43])]))
        : Promise.resolve(reponseOverpass()),
    )
    await useAppStore.getState().chercherLieu('Saint-Étienne')
    expect(useAppStore.getState().lieux.map((l) => l.label)).toEqual([
      'Saint-Étienne',
    ])
    expect(useAppStore.getState().lieuxVides).toBe(false)
  })

  it('distingue « rien trouvé » de « service en panne »', async () => {
    fetchMock.mockImplementation((url) =>
      url.includes('api-adresse')
        ? Promise.resolve(reponseBan([]))
        : Promise.resolve(reponseOverpass()),
    )
    await useAppStore.getState().chercherLieu('Zzzz')
    expect(useAppStore.getState().lieuxVides).toBe(true)
    expect(useAppStore.getState().lieuError).toBeNull()

    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('', { status: 503 })),
    )
    await useAppStore.getState().chercherLieu('Lyon')
    expect(useAppStore.getState().lieuError).toMatch(/503/)
    expect(useAppStore.getState().lieuxVides).toBe(false)
  })

  it('charge les itinéraires autour du lieu choisi', async () => {
    fetchMock.mockImplementation((url) =>
      url.includes('interpreter')
        ? Promise.resolve(reponseOverpass())
        : Promise.resolve(new Response('', { status: 404 })),
    )
    await useAppStore.getState().init()
    await useAppStore.getState().loadAutour({
      label: 'Saint-Étienne',
      contexte: '42, Loire',
      center: [4.38, 45.43],
    })

    expect(useAppStore.getState().zoneLabel).toBe('Autour de Saint-Étienne')
    expect(useAppStore.getState().itineraries.length).toBeGreaterThan(0)
    const requetes = fetchMock.mock.calls
      .map(([, init]) =>
        // Le corps est un formulaire encodé : décodé, il redevient du QL.
        new URLSearchParams(init?.body ?? '').get('data') ?? '',
      )
      .join(' ')
    expect(requetes).toContain('around:12000,45.430000,4.380000')
  })

  it('la dernière recherche demandée gagne, même si elle répond en premier', async () => {
    // Une frappe abandonnée ne doit pas écraser le résultat de la suivante.
    let lente: (r: Response) => void = () => undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          lente = resolve
        }),
    )
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(reponseBan([commune('Lyon', [4.83, 45.76])])),
    )

    const premiere = useAppStore.getState().chercherLieu('Ly')
    const seconde = useAppStore.getState().chercherLieu('Lyon')
    await seconde
    lente(reponseBan([commune('Ly-sur-rien', [1, 1])]))
    await premiere

    expect(useAppStore.getState().lieux.map((l) => l.label)).toEqual(['Lyon'])
  })
})
