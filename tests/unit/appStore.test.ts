// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest'
import {
  useAppStore,
  MIN_TOLERANCE,
  MAX_TOLERANCE,
  oublierReglagesTouches,
} from '../../src/store/appStore.ts'
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

function fichierGpx(
  nom: string,
  points: [number, number][],
  date?: string,
): File {
  const trkpts = points
    .map(
      ([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"><ele>800</ele></trkpt>`,
    )
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
  /*
    Et `localStorage` vidé, depuis que les réglages y vivent (#203).

    Il ne se remplace pas comme IndexedDB : c'est le même objet pour toute la
    session jsdom, et un réglage écrit par un test se retrouvait dans le
    suivant. Trouvé en le vivant — « démarre à 95 % » lisait le 90 % laissé par
    un voisin, et l'aurait lu aussi le jour où le défaut aurait été réel.
  */
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  // `reglagesTouches` vit à la portée du module, comme la page qui l'héberge :
  // il survit à `setState`, et donc d'un test au suivant. Le premier test qui
  // règle la tolérance rendrait tous les autres aveugles à ce que la base
  // contient — c'est arrivé dès l'écriture de la garde.
  oublierReglagesTouches()
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

  /**
   * Trouvaille de la revue du sprint 6.
   *
   * Le piège fermé juste en dessous pour les traces — « fusion, jamais
   * remplacement » — restait ouvert pour les réglages : `init` appliquait
   * ce qu'il avait lu en base par-dessus ce que la personne venait de
   * changer. Mesuré sur l'application : sous la charge de la suite e2e
   * complète, fermer le guide de démarrage dans la première seconde le
   * rouvrait tout seul. J'ai ajouté deux drapeaux à ce bloc sans relire le
   * commentaire écrit trois lignes plus bas.
   *
   * Les sept réglages sont éprouvés ensemble : c'est la garde qui est
   * testée, pas chacun de ses usages, et une garde recopiée est justement
   * le mode d'échec qu'on essaie d'éviter.
   */
  it('ne perd aucun réglage changé pendant le démarrage', async () => {
    // Une base déjà peuplée par une visite précédente : sans la garde, ce
    // sont ces valeurs-là qui écrasent les choix faits entre-temps.
    const precedent = useAppStore.getState()
    await precedent.init()
    await useAppStore.getState().setGuideFerme(true)
    await useAppStore.getState().setPanneauReplie(true)
    await useAppStore.getState().setGrosTexte(true)
    await useAppStore.getState().setModeAffichage('simple')
    await useAppStore.getState().setTolerance(MAX_TOLERANCE)
    await useAppStore.getState().setCompletionPct(100)
    await useAppStore.getState().basculerObjectif(42)

    // Nouvelle session : l'état repart à zéro, la base garde tout.
    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()

    const demarrage = useAppStore.getState().init()
    // Pendant que la base s'ouvre, la personne tranche autrement. Les sept
    // gestes sont lancés sans `await` : chaque setter change l'état de façon
    // synchrone avant sa première attente, ce qui les place tous avant que
    // `init` n'applique ce qu'il a lu. Les enchaîner par `await` laissait
    // `init` s'intercaler au milieu, et `basculerObjectif` — qui bascule sur
    // la liste courante — n'aurait plus dit ce qu'on croit.
    const etat = useAppStore.getState()
    const gestes = [
      etat.setGuideFerme(false),
      etat.setPanneauReplie(false),
      etat.setGrosTexte(false),
      etat.setModeAffichage('complet'),
      etat.setTolerance(MIN_TOLERANCE),
      // 90 et non 80 : le seuil est ramené à l'un des trois choix proposés.
      etat.setCompletionPct(90),
      etat.basculerObjectif(7),
    ]
    await demarrage
    await Promise.all(gestes)

    const apres = useAppStore.getState()
    expect(apres.guideFerme).toBe(false)
    expect(apres.panneauReplie).toBe(false)
    expect(apres.grosTexte).toBe(false)
    expect(apres.modeAffichage).toBe('complet')
    expect(apres.toleranceMeters).toBe(MIN_TOLERANCE)
    expect(apres.completionPct).toBe(90)
    expect(apres.objectifs).toEqual([7])
  })

  it('applique ce que la base contient quand personne n’a rien touché', async () => {
    const precedent = useAppStore.getState()
    await precedent.init()
    await useAppStore.getState().setGuideFerme(true)
    await useAppStore.getState().setModeAffichage('simple')

    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
    await useAppStore.getState().init()

    expect(useAppStore.getState().guideFerme).toBe(true)
    expect(useAppStore.getState().modeAffichage).toBe('simple')
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
    expect(enBase?.map((t) => t.filename)).toContain('pendant-le-demarrage.gpx')
  })

  it('repère encore le doublon d’une trace déposée au démarrage', async () => {
    const demarrage = useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(10))])
    await demarrage
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie-copie.gpx', ligne(10))])

    // Depuis l'issue #165 le doublon n'est plus refusé mais mis de côté :
    // ce que ce test garde, c'est qu'il est toujours repéré malgré la
    // course avec l'ouverture de la base.
    expect(useAppStore.getState().importDoublons).toHaveLength(1)
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
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('a.gpx', ligne(20))])
    await useAppStore.getState().setTolerance(80)

    // Une nouvelle session, c'est un rechargement de page : l'état repart à
    // zéro *et* le module qui retient les réglages touchés aussi.
    useAppStore.setState(etatInitial, true)
    oublierReglagesTouches()
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
      if (etat.zoneLoading && etat.zoneLoadBytes > 0)
        vus.push(etat.zoneLoadBytes)
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

    fetchMock.mockImplementation(() =>
      Promise.reject(new Error('réseau coupé')),
    )
    await useAppStore.getState().loadZone('pilat')

    const etat = useAppStore.getState()
    // Les tracés restent affichés — et l'utilisateur est prévenu qu'ils datent.
    expect(etat.itineraries).toHaveLength(3)
    expect(etat.zoneError).toMatch(/injoignables/i)
    expect(etat.zoneLoading).toBe(false)
  })

  it('explique l’échec quand il n’y a rien en cache', async () => {
    await useAppStore.getState().init()
    fetchMock.mockImplementation(() =>
      Promise.reject(new Error('réseau coupé')),
    )
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
      .importGpxFiles([
        fichierGpx('sortie.gpx', ligne(20), '2026-05-01T08:00:00Z'),
      ])
    const [trace] = useAppStore.getState().tracks
    expect(trace?.filename).toBe('sortie.gpx')
    expect(trace?.date).toBe('2026-05-01T08:00:00Z')
    expect(trace?.points).toHaveLength(20)
    expect(trace?.elevationGain).toBe(0)
  })

  it('met de côté une trace identique à une trace déjà importée', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('a.gpx', ligne(20))])
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('copie.gpx', ligne(20))])
    expect(useAppStore.getState().tracks).toHaveLength(1)
    const [doublon] = useAppStore.getState().importDoublons
    expect(doublon?.filename).toBe('copie.gpx')
    expect(doublon?.ressembleA).toBe('a.gpx')
    // Ce n'est pas une erreur de lecture : le fichier est bon, c'est nous
    // qui hésitons. Il n'a rien à faire dans le bandeau d'erreurs.
    expect(useAppStore.getState().importErrors).toEqual([])
  })

  describe('doublons mis de côté (issue #165)', () => {
    async function deuxFois() {
      await useAppStore.getState().init()
      await useAppStore
        .getState()
        .importGpxFiles([fichierGpx('a.gpx', ligne(20))])
      await useAppStore
        .getState()
        .importGpxFiles([fichierGpx('copie.gpx', ligne(20))])
      return useAppStore.getState().importDoublons[0]!
    }

    it('« importer quand même » ajoute vraiment la trace', async () => {
      // L'empreinte est une heuristique : quand elle se trompe, la personne
      // doit pouvoir passer outre, sans quoi la sortie est perdue.
      const doublon = await deuxFois()
      await useAppStore.getState().importerDoublon(doublon.id)
      expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
        'a.gpx',
        'copie.gpx',
      ])
      expect(useAppStore.getState().importDoublons).toEqual([])
    })

    it('la trace forcée survit au rechargement', async () => {
      const doublon = await deuxFois()
      await useAppStore.getState().importerDoublon(doublon.id)
      useAppStore.setState({ ...etatInitial })
      await useAppStore.getState().init()
      expect(useAppStore.getState().tracks).toHaveLength(2)
    })

    it('« ignorer » retire la proposition sans rien importer', async () => {
      const doublon = await deuxFois()
      useAppStore.getState().ignorerDoublon(doublon.id)
      expect(useAppStore.getState().tracks).toHaveLength(1)
      expect(useAppStore.getState().importDoublons).toEqual([])
    })

    it('un identifiant inconnu ne casse rien', async () => {
      await deuxFois()
      await useAppStore.getState().importerDoublon('inexistant')
      expect(useAppStore.getState().tracks).toHaveLength(1)
      expect(useAppStore.getState().importDoublons).toHaveLength(1)
    })

    it('deux fichiers identiques dans le même lot ne passent qu’une fois', async () => {
      await useAppStore.getState().init()
      await useAppStore
        .getState()
        .importGpxFiles([
          fichierGpx('a.gpx', ligne(20)),
          fichierGpx('b.gpx', ligne(20)),
        ])
      expect(useAppStore.getState().tracks).toHaveLength(1)
      expect(useAppStore.getState().importDoublons).toHaveLength(1)
    })

    it('« tout ignorer » vide le mur d’un réimport d’archive', async () => {
      // Redéposer une archive entière produit autant de propositions que de
      // sorties : les écarter une par une n'est pas une réponse.
      await useAppStore.getState().init()
      const lot = [
        fichierGpx('a.gpx', ligne(20)),
        fichierGpx('b.gpx', ligne(20, 45.5)),
        fichierGpx('c.gpx', ligne(20, 45.6)),
      ]
      await useAppStore.getState().importGpxFiles(lot)
      expect(useAppStore.getState().tracks).toHaveLength(3)
      await useAppStore.getState().importGpxFiles(lot)
      expect(useAppStore.getState().importDoublons).toHaveLength(3)

      useAppStore.getState().ignorerTousDoublons()
      expect(useAppStore.getState().importDoublons).toEqual([])
      expect(useAppStore.getState().tracks).toHaveLength(3)
    })

    it('ne met rien de côté quand les traces diffèrent au milieu', async () => {
      // Deux boucles au départ du même parking : l'empreinte enrichie les
      // sépare, elles s'importent toutes les deux sans rien demander.
      await useAppStore.getState().init()
      const nord: [number, number][] = [
        [4.5, 45.4],
        [4.52, 45.45],
        [4.54, 45.5],
        [4.52, 45.45],
        [4.5, 45.4],
      ]
      const sud: [number, number][] = [
        [4.5, 45.4],
        [4.52, 45.35],
        [4.54, 45.3],
        [4.52, 45.35],
        [4.5, 45.4],
      ]
      await useAppStore
        .getState()
        .importGpxFiles([
          fichierGpx('nord.gpx', nord),
          fichierGpx('sud.gpx', sud),
        ])
      expect(useAppStore.getState().tracks).toHaveLength(2)
      expect(useAppStore.getState().importDoublons).toEqual([])
    })
  })

  it('signale un fichier sans point exploitable sans perdre les autres', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([
        fichierGpx('vide.gpx', []),
        fichierGpx('bonne.gpx', ligne(20)),
      ])
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

  it('dit combien de points hors limites ont été écartés (issue #167)', async () => {
    await useAppStore.getState().init()
    // Une trace correcte à laquelle un outil buggé a ajouté deux points
    // impossibles : la trace reste importable, et l'utilisateur l'apprend.
    const points: [number, number][] = [...ligne(20), [200, 95], [201, 96]]
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', points)])
    expect(useAppStore.getState().tracks).toHaveLength(1)
    expect(useAppStore.getState().tracks[0]?.points).toHaveLength(20)
    expect(useAppStore.getState().importErrors).toContain(
      'sortie.gpx : 2 points hors limites ont été ignorés.',
    )
  })

  it('ne dit rien sur un fichier dont tous les points tombent sur Terre', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('propre.gpx', ligne(20))])
    expect(useAppStore.getState().importErrors).toEqual([])
  })

  it('dit pourquoi une trace trop espacée ne sera pas comptée (issue #148)', async () => {
    await useAppStore.getState().init()
    // ~1,7 km entre points : une montre en économie de batterie. La sortie
    // est réelle et complète ; sans message, l'utilisateur lit un chiffre
    // très bas — 0 % si toute la trace est ainsi — et conclut que
    // l'application est cassée.
    const econome: [number, number][] = Array.from({ length: 12 }, (_, i) => [
      4.5 + i * 0.022,
      45.4,
    ])
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('montre-economie.gpx', econome)])

    expect(useAppStore.getState().tracks).toHaveLength(1)
    const message = useAppStore.getState().importErrors.join(' ')
    expect(message).toMatch(/montre-economie\.gpx/)
    expect(message).toMatch(/un point tous les/)
    // Le chiffre est nommé, pas remplacé par un adjectif.
    expect(message).toMatch(/1,7 km/)
  })

  it('ne dit rien d’une trace ordinaire', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('normale.gpx', ligne(30))])
    expect(useAppStore.getState().importErrors).toEqual([])
  })

  it('remet l’avancement à zéro une fois le lot terminé', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([
        fichierGpx('a.gpx', ligne(20)),
        fichierGpx('b.gpx', ligne(20, 45.5)),
      ])
    expect(useAppStore.getState().importProgress).toBeNull()
    expect(useAppStore.getState().tracks).toHaveLength(2)
  })
})

/** Boucles locales minimales, au format du jeu Métropole de Lyon. */
function boucleFeature(gid: number, decalage: number) {
  return {
    type: 'Feature',
    properties: { gid, nom: `Boucle ${String(gid)}`, commune_depart: 'Lyon' },
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        Array.from({ length: 30 }, (_, i) => [
          4.8 + i * 0.001,
          45.7 + decalage,
        ]),
      ],
    },
  }
}

const BOUCLES_LOCALES = JSON.stringify({
  type: 'FeatureCollection',
  features: [1, 2, 3, 4, 5].map((gid) => boucleFeature(gid, gid * 0.02)),
})

describe('démonstration (issue #172)', () => {
  /**
   * La démonstration montre un tableau de bord rempli sans rien demander.
   * Sa promesse tient à une seule chose : ne jamais toucher aux vraies
   * données. Ces tests attaquent exactement cela.
   */
  beforeEach(() => {
    fetchMock.mockImplementation((url) => {
      if (url.includes('interpreter')) return Promise.resolve(reponseOverpass())
      if (url.includes('boucles-metropole-lyon')) {
        return Promise.resolve(new Response(BOUCLES_LOCALES, { status: 200 }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
  })

  async function demarrer() {
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
  }

  it('remplit la carte et le tableau de bord', async () => {
    await demarrer()
    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(true)
    expect(etat.itineraries.length).toBeGreaterThan(0)
    expect(etat.tracks.length).toBeGreaterThan(0)
    expect(etat.zoneLabel).toMatch(/démonstration/i)
  })

  it('n’écrit rien en base', async () => {
    await demarrer()
    // Le contrôle qui compte : rechargement complet, et il ne doit rien
    // rester. Une démonstration persistée serait une pollution silencieuse.
    useAppStore.setState({ ...etatInitial })
    await useAppStore.getState().init()
    expect(useAppStore.getState().tracks).toEqual([])
    expect(useAppStore.getState().demonstration).toBe(false)
  })

  it('s’efface au premier vrai import, sans emporter la trace importée', async () => {
    await demarrer()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vraie-sortie.gpx', ligne(20))])
    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(false)
    expect(etat.tracks.map((t) => t.filename)).toEqual(['vraie-sortie.gpx'])
  })

  it('la vraie sortie importée après une démonstration survit au rechargement', async () => {
    await demarrer()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vraie-sortie.gpx', ligne(20))])
    useAppStore.setState({ ...etatInitial })
    await useAppStore.getState().init()
    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      'vraie-sortie.gpx',
    ])
  })

  it('quitter rend l’application à ce qui existait vraiment', async () => {
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('a.gpx', ligne(20))])
    await useAppStore.getState().demarrerDemonstration()
    expect(useAppStore.getState().tracks[0]?.filename).toMatch(/démonstration/i)

    await useAppStore.getState().quitterDemonstration()
    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(false)
    expect(etat.tracks.map((t) => t.filename)).toEqual(['a.gpx'])
  })

  it('restaurer une sauvegarde ne mélange pas les sorties fictives', async () => {
    // Trou trouvé à la revue du sprint 2 : exporterSauvegarde quittait bien
    // la démonstration, mais pas importerSauvegarde. Les trois sorties
    // fictives restaient en mémoire, comptées dans les statistiques de
    // l'utilisateur, jusqu'au rechargement suivant.
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vraie.gpx', ligne(12))])
    const backup = buildBackup({
      tracks: useAppStore.getState().tracks,
      customItineraries: [],
      settings: { toleranceMeters: useAppStore.getState().toleranceMeters },
      exportedAt: '2026-08-20T10:00:00Z',
    })

    vi.stubGlobal('indexedDB', new IDBFactory())
    useAppStore.setState(etatInitial, true)
    vi.stubGlobal('fetch', fetchMock)
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    expect(useAppStore.getState().demonstration).toBe(true)

    await useAppStore
      .getState()
      .importerSauvegarde(
        new File([serialiserBackup(backup)], 'sauvegarde.json'),
      )

    expect(useAppStore.getState().demonstration).toBe(false)
    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      'vraie.gpx',
    ])
  })

  it('charger une vraie zone quitte la démonstration (cinquième chemin)', async () => {
    // Trouvé par le relecteur adverse, après trois revues qui l'avaient
    // manqué. La PR #192 affirmait avoir nommé la garde « plutôt que de la
    // recopier » — elle l'avait posée sur l'import, l'export et la
    // restauration, et oubliée sur le chargement de zone.
    //
    // Sans elle : la zone devient réelle, les itinéraires aussi, et les
    // trois sorties fictives restent dans la liste, sous un bandeau qui
    // annonce toujours une démonstration.
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    expect(useAppStore.getState().demonstration).toBe(true)

    await useAppStore.getState().loadZone('pilat')

    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(false)
    expect(etat.zoneKey).toBe('pilat')
    // Aucune sortie fictive ne survit au passage sur de vraies données.
    expect(etat.tracks.filter((t) => t.id.startsWith('demo-'))).toEqual([])
  })

  it('une vraie zone chargée pendant la démo survit à l’import suivant', async () => {
    // Le scénario complet de la sonde : démo → vraie zone → vrai import.
    // Sans la garde dans l'entonnoir, quitterDemonstration se déclenchait à
    // l'import et emportait la zone réelle avec les données fictives.
    await useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    await useAppStore.getState().loadZone('pilat')
    expect(useAppStore.getState().itineraries.length).toBeGreaterThan(0)

    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vraie.gpx', ligne(20))])

    const etat = useAppStore.getState()
    expect(etat.zoneKey).toBe('pilat')
    expect(etat.itineraries.length).toBeGreaterThan(0)
    expect(etat.tracks.map((t) => t.filename)).toEqual(['vraie.gpx'])
  })

  it('importer pendant la démo garde les boucles, qui sont réelles', async () => {
    // Trouvaille du relecteur adverse. Les itinéraires affichés pendant une
    // démonstration ne sont pas fictifs : ce sont les boucles open data de
    // la Métropole. Les effacer avec le drapeau détruisait des données
    // réelles — et le bandeau promet « importez vos propres traces pour
    // voir vos vrais chiffres », ce qui rendait zéro itinéraire et zéro
    // chiffre à qui obéissait.
    await demarrer()
    const boucles = useAppStore.getState().itineraries.length
    expect(boucles).toBeGreaterThan(0)

    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('vraie.gpx', ligne(20, 45.72))])

    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(false)
    expect(etat.itineraries).toHaveLength(boucles)
    expect(etat.tracks.map((t) => t.filename)).toEqual(['vraie.gpx'])
    // Et la zone ne se présente plus comme une démonstration.
    expect(etat.zoneLabel).not.toMatch(/démonstration/i)
  })

  it('un retour de visiteur ne mêle pas ses vraies sorties aux fictives', async () => {
    // Le chemin le plus vicieux : il ne demande aucune action. EmptyState
    // reste visible tant qu'init() n'a pas fini ; le visiteur clique
    // « Voir un exemple » et la base rend ses vraies données par-dessus.
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('ma-sortie.gpx', ligne(20))])

    useAppStore.setState({ ...etatInitial })
    const demarrage = useAppStore.getState().init()
    await useAppStore.getState().demarrerDemonstration()
    await demarrage

    const etat = useAppStore.getState()
    expect(etat.demonstration).toBe(true)
    // Aucune vraie sortie ne s'invite dans la démonstration.
    expect(etat.tracks.every((t) => t.id.startsWith('demo-'))).toBe(true)

    // Et rien n'est perdu : quitter la rend.
    await useAppStore.getState().quitterDemonstration()
    expect(useAppStore.getState().tracks.map((t) => t.filename)).toEqual([
      'ma-sortie.gpx',
    ])
  })

  it('quitter deux fois ne casse rien', async () => {
    await demarrer()
    await useAppStore.getState().quitterDemonstration()
    await useAppStore.getState().quitterDemonstration()
    expect(useAppStore.getState().tracks).toEqual([])
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
    await useAppStore.getState().importGpxFiles([
      fichierGpx(
        'gr7.gpx',
        ligne(40, 45.4 + 15 / 111_195).map(([lon]) => [
          lon,
          45.4 + 15 / 111_195,
        ]),
      ),
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
    expect(useAppStore.getState().detailItineraryId).toBe(
      premier?.osmRelationId,
    )

    useAppStore.getState().selectItinerary(second?.osmRelationId ?? 0)
    // La fiche n'a plus de sujet cohérent : elle se ferme.
    expect(useAppStore.getState().detailItineraryId).toBeNull()
    expect(useAppStore.getState().selectedItineraryId).toBe(
      second?.osmRelationId,
    )
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
      .importGpxFiles([fichierGpx('gr7.gpx', ligne(40, 45.4 + 15 / 111_195))])
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
      .map(
        ([lon, lat]) =>
          `<trkpt lat="${lat}" lon="${lon}"><ele>800</ele></trkpt>`,
      )
      .join('')
    return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`
  }

  it('importe les traces d’une archive déposée telle quelle', async () => {
    // Ce qui remplace un connecteur Strava : l'utilisateur exporte ses
    // données chez eux et dépose l'archive ici, sans rien envoyer nulle part.
    const archive = await buildZip([
      { nom: 'activities/1.gpx', contenu: gpx(ligne(10)) },
      {
        nom: 'activities/2.gpx.gz',
        contenu: await gzip(gpx(ligne(12, 45.41))),
        methode: 0,
      },
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
      .map(
        ([, init]) =>
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

describe('actualiser la zone affichée', () => {
  const reponseBan = (features: unknown[]) =>
    new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  it('refait la requête pour une zone prédéfinie', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const avant = fetchMock.mock.calls.length
    await useAppStore.getState().rafraichirZone()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(avant)
  })

  it('refait la requête pour une recherche par ref', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().loadRef('GR 7')
    const avant = fetchMock.mock.calls.length
    await useAppStore.getState().rafraichirZone()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(avant)
  })

  it('refait la requête pour une zone « autour d’un lieu »', async () => {
    // Régression : la clé d'une zone « autour » n'est pas un identifiant de
    // ZONES, et le bouton « Actualiser » ne faisait donc rien du tout — en
    // silence, ce qui est la pire façon de ne rien faire.
    await useAppStore.getState().init()
    fetchMock.mockImplementation((url) =>
      url.includes('api-adresse')
        ? Promise.resolve(reponseBan([]))
        : Promise.resolve(reponseOverpass()),
    )
    await useAppStore.getState().loadAutour({
      label: 'Saint-Étienne',
      contexte: '42, Loire',
      center: [4.38, 45.43],
    })
    const avant = fetchMock.mock.calls.length

    await useAppStore.getState().rafraichirZone()

    expect(fetchMock.mock.calls.length).toBeGreaterThan(avant)
    // Et c'est bien la même zone qui est rechargée, au même endroit.
    const derniere = new URLSearchParams(
      fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1]?.body ?? '',
    ).get('data')
    expect(derniere).toContain('around:12000,45.430000,4.380000')
    expect(useAppStore.getState().zoneLabel).toBe('Autour de Saint-Étienne')
  })

  it('ne fait rien quand aucune zone n’est chargée', async () => {
    await useAppStore.getState().init()
    const avant = fetchMock.mock.calls.length
    await useAppStore.getState().rafraichirZone()
    expect(fetchMock.mock.calls.length).toBe(avant)
  })
})

describe('quand la base refuse d’écrire', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useAppStore.setState({ ...etatInitial }, true)
  })

  /**
   * Trouvé à la revue du sprint 4. `db.saveTrack` était dans le même `try`
   * que la lecture du fichier : un quota de stockage dépassé produisait
   * « lecture impossible », ce qui est faux — le fichier a été lu
   * parfaitement, c'est la place qui manque. Et la trace était perdue pour
   * la session entière, pas seulement pour le rechargement suivant.
   *
   * Le sprint 4 rend ce chemin nettement plus atteignable : conserver
   * l'horodatage de chaque point double ce qu'on écrit par trace.
   */
  it('garde la trace en mémoire et dit la vérité sur la cause', async () => {
    await useAppStore.getState().init()
    const db = useAppStore.getState().db
    expect(db).not.toBeNull()
    const quota = new DOMException('quota', 'QuotaExceededError')
    vi.spyOn(db!, 'saveTrack').mockRejectedValue(quota)

    await useAppStore
      .getState()
      .importGpxFiles([fichierGpx('sortie.gpx', ligne(20))])

    // La trace compte pour cette session.
    expect(useAppStore.getState().tracks).toHaveLength(1)
    const message = useAppStore.getState().importErrors.join(' ')
    expect(message).toMatch(/sortie\.gpx/)
    // Ni « lecture impossible », ni un silence.
    expect(message).not.toMatch(/lecture impossible/)
    expect(message).toMatch(/enregistrée|place|stockage/i)
  })
})

/**
 * Issue #203 — un réglage modifié puis suivi d'un rechargement immédiat était
 * perdu sans un mot.
 *
 * Les sept setters écrivaient dans IndexedDB, dont aucune écriture n'est
 * synchrone. Entre le clic et la fin de la transaction, l'interface affirmait
 * quelque chose que la base ne savait pas encore : un rechargement dans cette
 * fenêtre annulait la transaction, et le réglage revenait à sa valeur
 * précédente alors que la personne l'avait vu changer.
 *
 * ## Ce que ces tests mesurent, et ce qu'ils ne mesurent pas
 *
 * Le symptôme d'origine est une course : `seuil.spec.ts` échouait une fois sur
 * deux en suite complète, jamais seul. Un test qui reproduirait cette course
 * serait rouge une fois sur deux **avec ou sans** le correctif — donc
 * incapable de dire lequel des deux il mesure (§1).
 *
 * On mesure donc l'invariant, qui est déterministe : **quand le setter rend la
 * main, la valeur est déjà écrite dans un magasin qui survit au
 * rechargement.** Pas de fenêtre à attraper, une durabilité à constater.
 */
describe('un réglage est durable dès que la main est rendue (#203)', () => {
  /** La clef telle que `db/reglages.ts` la nomme. */
  const clef = (nom: string): string => `sentiers.reglage.${nom}`

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useAppStore.setState({ ...etatInitial }, true)
    oublierReglagesTouches()
  })

  it('écrit le gros texte avant de rendre la main', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setGrosTexte(true)
    // Lecture synchrone, sans attendre quoi que ce soit : c'est le point.
    expect(localStorage.getItem(clef('grosTexte'))).toBe('1')
    expect(useAppStore.getState().grosTexte).toBe(true)
  })

  /**
   * Le type compte autant que la valeur. `completionPct` vaut 95 et non
   * « 95 » : `normalizeCompletionPct` rend sa valeur par défaut sur autre
   * chose qu'un nombre, si bien qu'une chaîne aurait silencieusement remis le
   * seuil à zéro au premier rechargement — un correctif qui casse ce qu'il
   * protège.
   */
  it('garde le type du seuil, et pas seulement ses chiffres', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setCompletionPct(100)
    expect(
      JSON.parse(localStorage.getItem(clef('completionPct')) ?? 'null'),
    ).toBe(100)
  })

  it('relit ce qui a été écrit, sur une session neuve', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setModeAffichage('simple')
    await useAppStore.getState().setCompletionPct(90)

    // Une session repart de zéro : nouvel état, réglages oubliés.
    useAppStore.setState({ ...etatInitial }, true)
    oublierReglagesTouches()
    await useAppStore.getState().init()

    expect(useAppStore.getState().modeAffichage).toBe('simple')
    expect(useAppStore.getState().completionPct).toBe(90)
  })

  /**
   * Le point qui décide si le correctif est livrable : **une mise à jour ne
   * doit rien effacer**. Les réglages déjà enregistrés vivent dans IndexedDB ;
   * sans reprise, la personne retrouverait des valeurs par défaut — seuil,
   * tolérance, mode d'affichage, objectifs épinglés.
   */
  it('reprend les réglages qu’une version antérieure a laissés en base', async () => {
    await useAppStore.getState().init()
    const db = useAppStore.getState().db
    expect(db).not.toBeNull()
    // On écrit comme l'ancienne version le faisait, directement dans le
    // magasin IndexedDB, et on efface la trace synchrone.
    await db!.raw.put('settings', 'simple', 'modeAffichage')
    await db!.raw.put('settings', 90, 'completionPct')
    localStorage.clear()

    useAppStore.setState({ ...etatInitial }, true)
    oublierReglagesTouches()
    await useAppStore.getState().init()

    expect(useAppStore.getState().modeAffichage).toBe('simple')
    expect(useAppStore.getState().completionPct).toBe(90)
    // Et repris pour de bon : la session suivante n'a plus besoin de la base.
    expect(localStorage.getItem(clef('modeAffichage'))).toBe('"simple"')
  })

  /**
   * L'autre moitié : un navigateur qui refuse `localStorage` — Safari en
   * navigation privée, une configuration verrouillée — doit continuer de
   * fonctionner. La fenêtre de #203 y revient, et c'est dit dans le code
   * plutôt que masqué ; ce qui ne doit pas revenir, c'est un réglage sans
   * aucun effet.
   */
  it('continue d’enregistrer quand le stockage synchrone refuse', async () => {
    const vrai = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('refusé', 'SecurityError')
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    })
    try {
      await useAppStore.getState().init()
      await useAppStore.getState().setCompletionPct(90)
      expect(useAppStore.getState().completionPct).toBe(90)
      const db = useAppStore.getState().db
      expect(await db!.getSetting('completionPct')).toBe(90)
    } finally {
      vi.unstubAllGlobals()
      if (vrai) Object.defineProperty(globalThis, 'localStorage', vrai)
    }
  })
})

/**
 * Trouvé à la revue du sprint du 24/08, et de mon fait.
 *
 * La première version de `db/reglages.ts` sondait la disponibilité du
 * magasin par une **écriture d'essai, à chaque appel** — lecture comprise.
 * Deux conséquences, dont la seconde est un vrai défaut :
 *
 * - dix-neuf écritures `localStorage` pour un démarrage et un seul réglage
 *   changé, dont une seule réelle ;
 * - un magasin **plein** refuse d'écrire mais lit très bien. La sonde
 *   échouait, la lecture retombait sur IndexedDB, et rendait la valeur
 *   d'avant la reprise : le réglage semblait revenir tout seul en arrière —
 *   exactement le défaut que #203 venait de corriger.
 *
 * Une capacité d'écriture ne se demande qu'au moment d'écrire.
 */
describe('lire un réglage n’écrit rien (revue du sprint)', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    useAppStore.setState({ ...etatInitial }, true)
    oublierReglagesTouches()
  })

  it('un démarrage et un réglage n’écrivent que ce qu’on leur demande', async () => {
    await useAppStore.getState().init()
    let ecritures = 0
    const espion = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        ecritures += 1
      })
    try {
      await useAppStore.getState().setGrosTexte(true)
    } finally {
      espion.mockRestore()
    }
    expect(ecritures, 'des écritures de sonde se sont glissées').toBe(1)
  })

  /**
   * Le cas qui donne sa valeur au test : un magasin qui refuse d'écrire mais
   * accepte de lire doit **rendre ce qu'il contient**, et non retomber sur la
   * copie périmée d'IndexedDB.
   */
  it('un magasin plein continue de rendre ce qu’il a déjà', async () => {
    await useAppStore.getState().init()
    await useAppStore.getState().setCompletionPct(90)

    const espion = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('plein', 'QuotaExceededError')
      })
    try {
      const db = useAppStore.getState().db
      expect(await db!.getSetting('completionPct')).toBe(90)
    } finally {
      espion.mockRestore()
    }
  })
})
