// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useAppStore,
  oublierReglagesTouches,
} from '../../src/store/appStore.ts'
import { buildBackup, serialiserBackup } from '../../src/core/backup.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Le câblage du magasin, éprouvé depuis le magasin réel (#487).
 *
 * Le découpage en tranches (#155) a tenu sa promesse : chaque tranche est
 * éprouvable contre des doubles, et chacune l'est. Mais les deux moitiés ne
 * se rencontrent qu'à un seul endroit — les lambdas de dépendance
 * d'`appStore.ts` — et cet endroit-là n'était éprouvé d'aucun côté.
 *
 * Mesuré plutôt que soupçonné. En remplaçant `fermerLaFicheSi` et
 * `fermerLaFiche` par `throw new Error(…)`, les 2 299 tests restaient verts :
 * aucun ne les exécutait. Puis un recensement des ports par la carte
 * d'appels de v8 en a nommé cinq jamais appelés :
 *
 *   trancheImport      fermerLaFicheSi        la fiche d'un itinéraire supprimé
 *   trancheTrace       fermerLaFiche          la fiche que le mode tracé recouvre
 *   trancheTrace       enregistrerLeTrace     un tracé dessiné, écrit en base
 *   trancheSauvegarde  setCompletionPct       un réglage repris d'une sauvegarde
 *   trancheSauvegarde  maintenant             l'horodatage du fichier exporté
 *
 * Ce recensement s'est trompé une première fois, et de la façon que le §1
 * décrit : il jugeait un port mort quand *toutes* ses lignes l'étaient, or
 * la ligne de la propriété s'exécute à la construction du magasin. Il rendait
 * donc « deux morts » là où l'injection en avait prouvé quatre de plus. C'est
 * la carte des fonctions (`fnMap`), et non celle des instructions, qui répond
 * à « cette lambda a-t-elle été appelée ». Une sonde se juge sur ce qu'elle
 * trouve quand on remet un défaut connu — ici, sur les deux ports déjà
 * prouvés morts à la main, et elle ne les trouvait pas.
 *
 * Il s'est trompé une deuxième fois, sur son propre compte : « 34 ports »
 * écrit dans #487, puis « 27 » ici et dans la PR. Il y en a 45. Son motif
 * ne reconnaissait que les formes `nom :` et `nom(` — les dix-huit clés en
 * raccourci (`baseOuverte,`, `recompute,`, `enregistrerReglage,`…) lui
 * étaient invisibles — et il découpait sur des virgules prises à
 * l'intérieur des commentaires, coupant un port en deux pour en inventer un
 * autre. Remesuré, commentaires retirés d'abord et chaque port suivi
 * jusqu'au fichier où sa fonction est déclarée : 45 ports, dont sept
 * occurrences du `set` de Zustand, qui est un paramètre et non une fonction
 * à nous. Restent 38 ports qui nomment une fonction, et les 38 sont
 * appelées. La suite d'avant ce sprint appelait déjà les neuf qui
 * échappaient à l'instrument, de onze à deux cent treize fois : le trou ne
 * cachait pas un sixième port mort, mais il ne pouvait pas le dire, et
 * « 0 jamais appelé » affirmait donc plus que ce qui était mesuré (§5).
 *
 * Les six questions ci-dessous passent donc par `useAppStore` et non par
 * `trancheImport(deps)` : c'est le seul moyen d'éprouver le fil lui-même.
 * Chacune a été vue rouge en neutralisant le port qu'elle vise.
 *
 * Ce que ce fichier ne garde pas : rien n'empêche un port *neuf* de naître
 * mort demain. Le recensement est une mesure, pas une garde — le §6quater
 * dit ce que vaut un contrôle qu'il faut penser à lancer. Il vaudrait une
 * garde, et c'est écrit dans #487 plutôt que promis ici.
 */

/** État initial capturé à l'import : les actions, elles, ne changent pas. */
const etatInitial = { ...useAppStore.getState() }

/** Un GPX d'une trace nommée, de deux points — assez pour un itinéraire. */
function gpxPerso(nom: string): File {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="45.4000" lon="4.5000"></trkpt>
    <trkpt lat="45.4010" lon="4.5020"></trkpt>
  </trkseg></trk>
</gpx>`
  return new File([xml], `${nom}.gpx`, { type: 'application/gpx+xml' })
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  useAppStore.setState(etatInitial, true)
  oublierReglagesTouches()
  /*
    Overpass rend le Pilat ; tout le reste rend 404. Les boucles locales
    embarquées sont absentes en test, et l'application doit s'en passer —
    c'est le même montage que `appStore.test.ts`, et pour la même raison.
  */
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

/** Importe un itinéraire perso et ouvre sa fiche. Rend son identifiant. */
async function ficheOuverteSurUnItineraire(nom: string): Promise<number> {
  await useAppStore.getState().init()
  await useAppStore.getState().importCustomGpx([gpxPerso(nom)])

  const [itineraire] = useAppStore.getState().customItineraries
  expect(
    itineraire,
    'le fichier devait se lire : sans itinéraire, ce test ne mesure rien',
  ).toBeDefined()
  const id = itineraire?.osmRelationId ?? 0

  useAppStore.getState().openItineraryDetail(id)
  expect(
    useAppStore.getState().detailItineraryId,
    'la fiche devait être ouverte avant qu’on demande sa fermeture',
  ).toBe(id)
  return id
}

describe('la fiche détail ne survit pas à son sujet', () => {
  it('se ferme quand on supprime l’itinéraire qu’elle montre', async () => {
    const id = await ficheOuverteSurUnItineraire('Le mien')

    await useAppStore.getState().removeCustomItinerary(id)

    expect(useAppStore.getState().customItineraries).toHaveLength(0)
    expect(useAppStore.getState().detailItineraryId).toBeNull()
  })

  it('reste ouverte quand on supprime un autre itinéraire', async () => {
    /*
      Le pendant de la précédente, et ce qui donne sa raison d'être au `Si`
      de `fermerLaFicheSi` : une lambda qui fermerait toujours passerait la
      question ci-dessus sans rien garder de ce qui compte.
    */
    await useAppStore.getState().init()
    await useAppStore
      .getState()
      .importCustomGpx([gpxPerso('Celui-ci'), gpxPerso('Celui-là')])

    const [premier, second] = useAppStore.getState().customItineraries
    expect(second, 'il faut deux itinéraires pour poser la question').toBeDefined()
    const garde = premier?.osmRelationId ?? 0

    useAppStore.getState().openItineraryDetail(garde)
    await useAppStore
      .getState()
      .removeCustomItinerary(second?.osmRelationId ?? 0)

    expect(useAppStore.getState().detailItineraryId).toBe(garde)
  })
})

describe('le panneau de tracé et la fiche partagent la même zone d’écran', () => {
  it('passer en mode tracé ferme la fiche ouverte', async () => {
    await ficheOuverteSurUnItineraire('Le mien')

    useAppStore.getState().toggleDrawMode()

    expect(useAppStore.getState().drawMode).toBe(true)
    expect(useAppStore.getState().detailItineraryId).toBeNull()
  })

  /*
    Ce que ces questions ne gardent pas, dit plutôt que laissé croire.

    `toggleDrawMode` consulte `ficheOuverte()` avant d'appeler `fermerLaFiche`.
    La direction « faux » est gardée par la question ci-dessus — une lambda
    qui répondrait toujours `false` la fait rougir. La direction « vrai » ne
    l'est par rien, et ne peut pas l'être : appeler `closeItineraryDetail`
    sur une fiche déjà close ne change aucun état observable, le garde
    n'épargne qu'un appel inutile. C'est un survivant équivalent, et le
    §6bis dit qu'on l'écrit ici pour ne pas le rechasser à la vague suivante.
  */
})

describe('sauvegarder et restaurer passent aussi par le câblage', () => {
  it('l’export nomme le fichier avec l’horodatage que le magasin fournit', async () => {
    /*
      `maintenant` et `telecharger` sont deux ports que la tranche appelle
      sans les connaître. Le nom du fichier est la seule trace observable du
      premier : `backupFilename` le dérive de `exportedAt`, et une horloge
      figée rend donc le nom prévisible.
    */
    const recus: string[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:sentiers',
      revokeObjectURL: () => undefined,
    })
    /*
      L'ancre que `downloadBlob` fabrique est posée dans le document avant
      d'être cliquée : l'écoute en capture sur `document` la voit passer sans
      qu'on ait à remplacer `createElement`.
    */
    const noter = (evenement: Event) => {
      const cible = evenement.target
      if (cible instanceof HTMLAnchorElement) {
        evenement.preventDefault()
        recus.push(cible.download)
      }
    }
    document.addEventListener('click', noter, true)

    await useAppStore.getState().init()
    /*
      L'horloge n'est figée qu'ici, et pas avant `init` : `fake-indexeddb`
      avance ses transactions sur des minuteries, et des minuteries figées
      font attendre `init` indéfiniment. Mesuré en le vivant — cinq secondes
      de temporisation, sur les deux questions de ce bloc.
    */
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T04:05:06.000Z'))
    try {
      await useAppStore.getState().exporterSauvegarde()
    } finally {
      vi.useRealTimers()
      document.removeEventListener('click', noter, true)
    }

    expect(recus).toHaveLength(1)
    expect(recus[0]).toContain('2026-09-03')
  })

  it('restaurer une sauvegarde reprend le seuil de complétion qu’elle porte', async () => {
    /*
      `setCompletionPct` est le port par lequel la tranche redonne au magasin
      un réglage lu dans le fichier. Sans lui, la sauvegarde reviendrait
      amputée d'un réglage — sans erreur, sans message, et sans que rien ne
      le dise.
    */
    await useAppStore.getState().init()
    const initial = useAppStore.getState().completionPct
    const vise = initial === 90 ? 95 : 90

    const backup = buildBackup({
      tracks: [],
      customItineraries: [],
      settings: { toleranceMeters: 25, completionPct: vise },
      exportedAt: '2026-09-03T04:05:06.000Z',
    })
    await useAppStore
      .getState()
      .importerSauvegarde(new File([serialiserBackup(backup)], 's.json'))

    expect(useAppStore.getState().completionPct).toBe(vise)
  })
})

describe('un itinéraire tracé à la main atteint la base', () => {
  it('enregistre le tracé, le sélectionne, et recalcule', async () => {
    /*
      `enregistrerLeTrace` fait trois choses que la tranche ne peut pas faire
      elle-même : écrire en base, poser l'itinéraire dans la liste, relancer
      le calcul. Les trois sont assertées ici parce que la tranche, elle, ne
      voit qu'un double qui dit oui.

      Les points cliqués sont pris sur le réseau chargé : `snapToNetwork`
      refuse un point trop loin d'un sentier, et un tracé vide ne
      s'enregistre pas — la question serait verte sans rien avoir mesuré.
    */
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const [itineraire] = useAppStore.getState().itineraries
    const sommets = itineraire?.ways[0]?.coords ?? []
    expect(
      sommets.length,
      'il faut un sentier chargé pour avoir où cliquer',
    ).toBeGreaterThan(1)

    useAppStore.getState().toggleDrawMode()
    useAppStore.getState().addDrawPoint(sommets[0] as [number, number])
    useAppStore.getState().addDrawPoint(sommets[1] as [number, number])
    expect(
      useAppStore.getState().drawError,
      'les deux points devaient s’accrocher au réseau',
    ).toBeNull()

    await useAppStore.getState().saveDrawnItinerary('Ma boucle')

    const [trace] = useAppStore.getState().customItineraries
    expect(trace?.name).toBe('Ma boucle')
    expect(useAppStore.getState().selectedItineraryId).toBe(
      trace?.osmRelationId,
    )
    // Le port écrit en base : un rechargement doit retrouver l'itinéraire.
    const db = useAppStore.getState().db
    expect(await db?.listCustomItineraries()).toHaveLength(1)
  })
})

describe('deux ports dont l’appel ne suffisait pas à dire qu’ils sont tenus', () => {
  /*
    Trouvés par la vague de mutation lancée sur `appStore.ts` après les six
    questions ci-dessus : huit mutants y sont passés de « sans couverture » à
    « survivant ». Mes questions les exécutaient sans rien en dire — ce qui
    est exactement le reproche que ce fichier adresse au reste (§6bis).
  */

  it('donne à chaque tracé un identifiant négatif, et jamais deux fois le même', async () => {
    /*
      `nextCustomId` porte un commentaire — « ids négatifs » — et le §4bis dit
      qu'un commentaire qui justifie est une affirmation. Le signe n'est pas
      cosmétique : un identifiant perso positif entre en collision avec les
      identifiants de relation OSM, et deux itinéraires distincts se
      confondent alors dans `itineraireParId`, dans le matching et dans la
      sauvegarde.

      Trois mutants survivaient ici, tous parce qu'un seul tracé ne
      distingue rien : avec la liste vide, `Math.min(0)` et `Math.max(0)`
      rendent le même zéro.
    */
    await useAppStore.getState().init()
    await useAppStore.getState().loadZone('pilat')
    const sommets = useAppStore.getState().itineraries[0]?.ways[0]?.coords ?? []
    expect(sommets.length).toBeGreaterThan(1)

    const dessiner = async (nom: string) => {
      useAppStore.getState().toggleDrawMode()
      useAppStore.getState().addDrawPoint(sommets[0] as [number, number])
      useAppStore.getState().addDrawPoint(sommets[1] as [number, number])
      await useAppStore.getState().saveDrawnItinerary(nom)
    }
    await dessiner('Premier')
    await dessiner('Second')

    const ids = useAppStore
      .getState()
      .customItineraries.map((i) => i.osmRelationId)
    expect(ids).toHaveLength(2)
    expect(
      ids.filter((id) => id < 0),
      'un identifiant perso positif entrerait en collision avec une relation OSM',
    ).toEqual(ids)
    expect(new Set(ids).size).toBe(2)
  })

  it('ouvre la fiche sur l’itinéraire demandé, et pas sur rien', async () => {
    /*
      `itineraireParId` est le port qui dit à la fiche *quoi* montrer. Les
      questions ci-dessus prouvaient qu'il est appelé ; aucune ne regardait
      sa réponse, et le mutant qui remplace `===` par `!==` survivait donc.

      Ce qu'on observe : `openItineraryDetail` ne lance le profil altimétrique
      que s'il a obtenu un tracé d'au moins deux points. Un port qui rend le
      mauvais itinéraire — ou rien — éteint les deux chargements sur-le-champ.
      C'est la seule trace synchrone de sa réponse, et elle suffit.
    */
    const id = await ficheOuverteSurUnItineraire('Le mien')
    expect(useAppStore.getState().detailItineraryId).toBe(id)
    expect(
      useAppStore.getState().elevationLoading,
      'sans tracé retrouvé, la fiche renonce au profil sans le dire',
    ).toBe(true)
  })
})
