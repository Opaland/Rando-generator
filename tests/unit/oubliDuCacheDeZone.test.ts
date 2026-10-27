// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OverpassError } from '../../src/core/overpass.ts'
import pilat from '../fixtures/overpass/pilat.json' with { type: 'json' }
import type { DependancesZone } from '../../src/store/trancheZone.ts'
import { creerOubliDeZone } from '../../src/store/oubliDeZone.ts'
import type { SentiersDb } from '../../src/db/database.ts'

/**
 * « Oublier la zone en cache », les trois chemins forcés (issue #437).
 *
 * ## D'où vient ce fichier
 *
 * De la vague de mutation du 31/08. Trois blocs identiques à l'œil —
 * `loadZone`, `loadRef`, `loadAutour` — portaient six mutants survivants, et
 * aucun test ne regardait aucun des trois. Les deux directions changent un
 * résultat :
 *
 * - `if (force)` en `true` : tout chargement efface son cache, donc le cache
 *   ne sert plus jamais à rien, en silence ;
 * - `if (force)` en `false` : « Actualiser les tracés » n'actualise rien.
 *
 * ## Et les trois n'étaient pas identiques
 *
 * Deux lisaient `deps.etat().db`, la troisième attendait `deps.baseOuverte()`.
 * Ce n'est pas du style : `baseOuverte()` existe parce que `db` vaut `null`
 * pendant l'ouverture d'IndexedDB, et `trancheZone.ts:206` porte la leçon
 * datée — « au démarrage, la base s'ouvre pendant que l'utilisateur clique une
 * zone ».
 *
 * La dernière question de ce fichier est celle qui rougissait : les trois
 * chemins forcés, face à une base pas encore ouverte, doivent faire la même
 * chose. Deux ne la faisaient pas.
 *
 * ## Le soupçon vérifié et écarté
 *
 * J'ai d'abord cru qu'un `await` s'intercalait entre l'effacement et la
 * relecture du cache, laissant la base s'ouvrir entre les deux : la
 * suppression aurait été sautée et le cache périmé retrouvé juste après.
 * **Il n'y en a pas** — le corps de `loadFromOverpass` court en synchrone
 * jusqu'à sa première attente. Écrit ici parce qu'un faux positif coûte la
 * confiance dans les vrais.
 *
 * ## Oublier, mais seulement après une réponse (#548)
 *
 * Les trois chemins effaçaient la ligne **avant** d'interroger Overpass.
 * Hors réseau — le cas ordinaire en randonnée —, « Actualiser les tracés »
 * détruisait donc la copie hors ligne, le repli sur cache ne trouvait plus
 * rien, et au démarrage suivant l'application s'ouvrait vide.
 *
 * L'oubli a lieu désormais après une réponse valide, juste avant
 * l'écriture : si celle-ci échoue (quota), la ligne périmée ne survit pas
 * à la demande de s'en défaire, ce que #437 voulait. Si c'est le réseau qui
 * échoue, la copie reste, et le repli la sert avec son message.
 */

const appelsOverpass = { n: 0 }
/** Le réseau du test : il échoue, sauf quand une question le fait répondre. */
const reseau = { repond: false }

vi.mock('../../src/core/overpass.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/overpass.ts')>(
      '../../src/core/overpass.ts',
    )
  return {
    ...vrai,
    /*
      Neutralisé avant d'écrire, pas après : sans cela, chaque test de garde
      partirait pour une vraie requête réseau. Il rougirait — mais pour une
      raison qu'on n'a pas voulue, ce que le §1bis appelle une non-assertion.
      L'échec est le chemin le plus court : il n'écrit rien en cache.
    */
    fetchOverpass: () => {
      appelsOverpass.n += 1
      /*
        Une zone non vide : depuis #591, une recherche « autour » vide
        s'élargit à 25 km — une seconde requête, un second oubli, que ce
        fichier ne cherche pas à mesurer (voir rechercheAutourElargie.test.ts).
      */
      if (reseau.repond) return Promise.resolve(pilat)
      return Promise.reject(new OverpassError('miroirs injoignables (test)'))
    },
  }
})

const { trancheZone } = await import('../../src/store/trancheZone.ts')

/**
 * Une base dont on observe les suppressions, et qu'on peut déclarer « pas
 * encore ouverte » sans la rendre indisponible — c'est exactement la fenêtre
 * de démarrage que décrit `trancheZone.ts:206`.
 */
function harnais({
  baseOuverteDansLEtat,
  enCache,
}: {
  baseOuverteDansLEtat: boolean
  /** La copie hors ligne que la base sert pour toute clé, s'il y en a une. */
  enCache?: object
}) {
  const supprimees: string[] = []
  /** Oublis et écritures dans l'ordre où ils arrivent. */
  const journal: string[] = []
  const affichees: unknown[] = []
  const db = {
    getZone: () => Promise.resolve(enCache),
    saveZone: (zone: { zoneKey: string }) => {
      journal.push(`ecrit:${zone.zoneKey}`)
      return Promise.resolve()
    },
    deleteZone: (cle: string) => {
      supprimees.push(cle)
      journal.push(`oubli:${cle}`)
      return Promise.resolve()
    },
    setSetting: () => Promise.resolve(),
  } as unknown as SentiersDb

  const etat = {
    db: baseOuverteDansLEtat ? db : null,
    zoneKey: null,
    itineraries: [],
    demonstration: false,
    zoneLoading: false,
  }

  const deps = {
    set: (partiel: unknown) => {
      const bout =
        typeof partiel === 'function'
          ? (partiel as (e: unknown) => object)(etat)
          : partiel
      Object.assign(etat, bout)
    },
    etat: () => etat,
    // Rend la base même quand l'état ne la porte pas encore : c'est tout son
    // objet — faire patienter plutôt que perdre l'écriture.
    baseOuverte: () => Promise.resolve(db),
    persistLastZone: () => Promise.resolve(),
    // La MÊME implémentation que celle qu'`appStore.ts` branche — pas une
    // copie. Ma première version recopiait ces quatre lignes ici : elle
    // aurait passé même si le store avait gardé la mauvaise version.
    oublierLaZoneEnCache: creerOubliDeZone({ baseOuverte: () => Promise.resolve(db) }),
    recompute: () => Promise.resolve(),
    setItineraries: (_cle: string, _libelle: string, itineraires: unknown) => {
      affichees.push(itineraires)
    },
    // `loadAutour` referme la recherche de lieu par cette dépendance depuis
    // que celle-ci a sa propre tranche (#454) ; ici il n'y a rien à fermer.
    oublierLesLieux: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone

  return { actions: trancheZone(deps), supprimees, journal, affichees, etat }
}

const LIEU = { label: 'Chaponost', contexte: '69, Rhône', center: [4.7, 45.7] }

/** Les trois chemins qui acceptent `force`, et la clé que chacun oublie. */
const CHEMINS = [
  {
    nom: 'loadZone',
    cle: 'ain',
    lancer: (a: ReturnType<typeof harnais>['actions'], force: boolean) =>
      a.loadZone('ain', { force }),
  },
  {
    nom: 'loadRef',
    cle: 'ref:GR7',
    lancer: (a: ReturnType<typeof harnais>['actions'], force: boolean) =>
      a.loadRef('gr7', { force }),
  },
  {
    nom: 'loadAutour',
    cle: 'autour:4.7000,45.7000',
    lancer: (a: ReturnType<typeof harnais>['actions'], force: boolean) =>
      a.loadAutour(LIEU as Parameters<typeof a.loadAutour>[0], { force }),
  },
]

beforeEach(() => {
  appelsOverpass.n = 0
  reseau.repond = false
})

/** Une copie hors ligne, telle que `saveZone` l'a écrite. */
const COPIE = {
  zoneKey: 'copie',
  label: 'Copie',
  itineraries: [{ osmRelationId: 1 }],
  fetchedAt: '2026-10-01T00:00:00.000Z',
  schema: 1,
}

describe.each(CHEMINS)('$nom, base déjà ouverte', ({ cle, lancer }) => {
  it('oublie la zone en cache quand on force et que le réseau répond', async () => {
    reseau.repond = true
    const { actions, journal } = harnais({ baseOuverteDansLEtat: true })
    await lancer(actions, true)
    expect(
      journal,
      'un rechargement forcé laissait sa ligne en cache : « Actualiser les' +
        ' tracés » n’actualisait rien.',
    ).toEqual([`oubli:${cle}`, `ecrit:${cle}`])
  })

  it('garde la copie hors ligne quand on force et que le réseau échoue (#548)', async () => {
    const { actions, supprimees, affichees } = harnais({
      baseOuverteDansLEtat: true,
      enCache: COPIE,
    })
    await lancer(actions, true)
    expect(
      supprimees,
      '« Actualiser les tracés » hors réseau effaçait la copie hors ligne' +
        ' avant de savoir si les serveurs répondaient.',
    ).toEqual([])
    // Et le repli la sert : sans elle, l'écran se vidait au démarrage suivant.
    expect(affichees).toEqual([COPIE.itineraries])
  })

  it('rapporte le message du service, pas un générique, sans cache pour amortir l’échec', async () => {
    /*
      Trouvé par mutation du 17/10 : `error instanceof OverpassError ||
      error instanceof DbError` survivait muté en `&&` (une erreur ne peut
      être les deux instances à la fois, donc la condition devient
      toujours fausse) ou en `false`, parce qu'aucun test n'affirmait rien
      sur `zoneError` ici — seulement sur les clés effacées du cache.
      `fetchOverpass` est mockée plus haut pour rejeter avec une vraie
      `OverpassError` ; ce test lit enfin le message qu'elle laisse.
    */
    const { actions, etat } = harnais({ baseOuverteDansLEtat: true })
    await lancer(actions, false)
    expect((etat as { zoneError?: string }).zoneError).toBe(
      'miroirs injoignables (test)',
    )
  })

  it('ne l’oublie pas quand on ne force pas, même quand le réseau répond', async () => {
    /*
      Depuis #548, l'oubli n'a lieu qu'après une réponse : la question
      suivante, posée sur un réseau qui échoue, ne pouvait donc plus voir un
      `if (force)` devenu `if (true)`. Celle-ci le peut.
    */
    reseau.repond = true
    const { actions, journal } = harnais({ baseOuverteDansLEtat: true })
    await lancer(actions, false)
    expect(journal).toEqual([`ecrit:${cle}`])
  })

  it('ne l’oublie pas quand on ne force pas', async () => {
    const { actions, supprimees } = harnais({ baseOuverteDansLEtat: true })
    await lancer(actions, false)
    expect(
      supprimees,
      'chaque affichage de zone effaçait son propre cache : il ne servait' +
        ' plus jamais à rien, et sans que rien ne le dise.',
    ).toEqual([])
  })
})

describe('les trois chemins forcés, face à une base pas encore ouverte', () => {
  /*
    LA question de ce fichier, et celle qui rougissait sur deux des trois.

    La fenêtre est réelle : la base s'ouvre pendant que quelqu'un clique.
    `loadAutour` attendait `baseOuverte()` et effaçait ; `loadZone` et
    `loadRef` lisaient `deps.etat().db`, le trouvaient à `null`, et
    n'effaçaient rien. La ligne périmée survivait, et la visite suivante la
    resservait — alors qu'on venait de demander à s'en débarrasser.
  */
  it.each(CHEMINS)('$nom oublie quand même la zone', async ({ cle, lancer }) => {
    reseau.repond = true
    const { actions, supprimees } = harnais({ baseOuverteDansLEtat: false })
    await lancer(actions, true)
    expect(
      supprimees,
      'une actualisation forcée pendant l’ouverture de la base n’effaçait' +
        ' rien : la ligne périmée survivait à la demande de s’en défaire.',
    ).toEqual([cle])
  })
})

describe('une base qui ne s’ouvrira pas', () => {
  /*
    Le survivant de la vague du 01/09, et c'est celui du module lui-même.

    `oubliDeZone.ts` fait quatre lignes dont une garde : `if (db)`. Muter
    cette garde en `true` ne faisait rougir aucun test — parce que le harnais
    ci-dessus rend toujours une base, et que « pas encore ouverte » y veut
    dire « absente de l'état, mais `baseOuverte()` finira par la rendre ».

    Le cas où elle ne s'ouvrira **jamais** est réel : navigation privée,
    quota refusé, un Safari qui dit non. `baseOuverte()` rend alors `null`, et
    sans la garde `null.deleteZone` lève. Rien n'attrape cette exception —
    `loadRef` enchaîne directement dessus —, donc « Actualiser les tracés »
    ne chargerait plus rien du tout, en silence, chez quelqu'un dont le
    navigateur refuse déjà de retenir quoi que ce soit.

    Le module a été écrit pour porter cette garde (#437) et elle n'était pas
    éprouvée : c'est exactement le genre de test creux que la relecture ne
    voit pas et que la vague trouve (§6bis).
  */
  it('ne fait rien, plutôt que de lever', async () => {
    const oublier = creerOubliDeZone({ baseOuverte: () => Promise.resolve(null) })
    await expect(oublier('rhone')).resolves.toBeUndefined()
  })
})
