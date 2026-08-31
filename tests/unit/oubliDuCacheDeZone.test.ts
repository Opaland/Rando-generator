// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OverpassError } from '../../src/core/overpass.ts'
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
 */

const appelsOverpass = { n: 0 }

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
function harnais({ baseOuverteDansLEtat }: { baseOuverteDansLEtat: boolean }) {
  const supprimees: string[] = []
  const db = {
    getZone: () => Promise.resolve(undefined),
    putZone: () => Promise.resolve(),
    deleteZone: (cle: string) => {
      supprimees.push(cle)
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
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone

  return { actions: trancheZone(deps), supprimees, etat }
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
})

describe.each(CHEMINS)('$nom, base déjà ouverte', ({ cle, lancer }) => {
  it('oublie la zone en cache quand on force', async () => {
    const { actions, supprimees } = harnais({ baseOuverteDansLEtat: true })
    await lancer(actions, true)
    expect(
      supprimees,
      'un rechargement forcé laissait sa ligne en cache : « Actualiser les' +
        ' tracés » n’actualisait rien.',
    ).toEqual([cle])
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
    const { actions, supprimees } = harnais({ baseOuverteDansLEtat: false })
    await lancer(actions, true)
    expect(
      supprimees,
      'une actualisation forcée pendant l’ouverture de la base n’effaçait' +
        ' rien : la ligne périmée survivait à la demande de s’en défaire.',
    ).toEqual([cle])
  })
})
