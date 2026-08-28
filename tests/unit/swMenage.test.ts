import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'

/**
 * Le ménage du service worker, et ce qu'il n'a pas le droit d'emporter
 * (issue #370).
 *
 * ## Le raté
 *
 * `activate` supprime les caches dont le nom ne commence pas par `VERSION`.
 * C'est la forme canonique, et elle est juste — à une condition : que
 * `VERSION` change d'une livraison à l'autre.
 *
 * ```
 * $ git log --oneline -S "const VERSION = " -- public/sw.js
 * c8cc57e Hors-ligne : service worker, précache généré au build, bandeau honnête
 * ```
 *
 * Une seule ligne : la constante a été écrite une fois et n'a jamais bougé.
 * Il y a eu plus de deux cents déploiements depuis, et les trois caches
 * commencent tous par `sentiers-v1` : le filtre n'en retient aucun, et le
 * ménage ne s'est **jamais** exécuté.
 *
 * ## Le piège, qui est le vrai sujet de ce fichier
 *
 * Faire varier `VERSION` sans rien d'autre serait pire que le défaut.
 * `CACHE_TERRAIN` garde ce que le bouton « Emporter cette randonnée » a
 * rapatrié — les tuiles et le profil d'une sortie qu'on part faire demain,
 * là où il n'y aura pas de réseau. Son propre commentaire le dit : « on ne
 * jette pas une randonnée qu'on a téléchargée pour partir demain ».
 *
 * Si son nom portait la version, la mise à jour suivante l'effacerait.
 * Silencieusement, peut-être le matin du départ.
 *
 * **Seul le cache de l'application porte l'empreinte.** Les deux autres
 * gardent leur nom littéral, ce qui a en prime l'avantage de n'exiger
 * aucune migration : les téléchargements déjà en place restent trouvables.
 *
 * Ces tests mesurent les deux moitiés : ce qui **doit** partir, et ce qui ne
 * doit surtout pas.
 */

interface BacMenage {
  /** Les caches supprimés par l'activation. */
  supprimes: string[]
  /** Les noms que le service worker s'est donnés. */
  noms: { app: string; tuiles: string; terrain: string }
}

/**
 * Évalue `public/sw.js` avec des globales doublées, déclenche son `activate`
 * sur une liste de caches donnée, et rend ce qu'il a supprimé.
 *
 * Le fichier vit hors du bundle et n'exporte rien — c'est le même prix que
 * `tests/unit/swPrecharger.test.ts` paie déjà, et pour la même raison : un
 * service worker relu n'est pas un service worker éprouvé.
 */
async function activer(dejaLa: string[]): Promise<BacMenage> {
  const supprimes: string[] = []
  const caches = {
    keys: () => Promise.resolve([...dejaLa]),
    delete: (nom: string) => {
      supprimes.push(nom)
      return Promise.resolve(true)
    },
    open: () => Promise.resolve({ add: () => Promise.resolve() }),
  }

  /*
    Dans un objet plutôt qu'une variable : TypeScript ne suit pas
    l'affectation faite depuis le rappel d'`addEventListener`, et réduirait
    le type à `null` — la garde plus bas deviendrait « toujours vraie », donc
    inutile, et ESLint a raison de le dire.
  */
  const capte: { activation: ((event: unknown) => void) | null } = {
    activation: null,
  }
  const self = {
    __PRECACHE__: [] as string[],
    location: { origin: 'https://exemple.test' },
    addEventListener(type: string, ecouteur: (event: unknown) => void) {
      if (type === 'activate') capte.activation = ecouteur
    },
    skipWaiting: () => Promise.resolve(),
    clients: { matchAll: () => Promise.resolve([]), claim: () => Promise.resolve() },
  }

  /*
    Même dérogation, même raison que dans `swPrecharger.test.ts` : la chaîne
    évaluée est `public/sw.js`, lu par le bundler — le fichier du dépôt, pas
    une entrée venue du dehors.
  */
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fabrique = new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    `${swSource}\nreturn { CACHE_APP, CACHE_TUILES, CACHE_TERRAIN }`,
  ) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    Request: unknown,
  ) => { CACHE_APP: string; CACHE_TUILES: string; CACHE_TERRAIN: string }

  /*
    `activate` ne fabrique aucune requête : ces deux doublures existent pour
    satisfaire la signature de la fabrique, et échouent bruyamment si le
    service worker venait à s'en servir ici.
  */
  const jamaisAppele = () => {
    throw new Error("`activate` ne devrait toucher ni au réseau ni à Request")
  }
  const noms = fabrique(self, caches, jamaisAppele, jamaisAppele)

  if (capte.activation === null) {
    throw new Error(
      "Aucun écouteur `activate` n'a été posé par public/sw.js : le motif de " +
        'lecture ne correspond plus, et ce test ne garde donc plus rien.',
    )
  }

  const attendus: Promise<unknown>[] = []
  capte.activation({ waitUntil: (p: Promise<unknown>) => attendus.push(p) })
  await Promise.all(attendus)

  return {
    supprimes,
    noms: {
      app: noms.CACHE_APP,
      tuiles: noms.CACHE_TUILES,
      terrain: noms.CACHE_TERRAIN,
    },
  }
}

/**
 * Le nom que porte le cache d'application d'une version antérieure.
 *
 * `sentiers-v1-app` est celui qu'ont aujourd'hui tous les navigateurs qui ont
 * déjà ouvert Sentiers : c'est lui que la première activation après cette
 * correction devra emporter.
 */
const APP_ANCIEN = 'sentiers-v1-app'

/**
 * Ce que `vite.config.ts` remplace au build. Hors construction — donc ici —
 * le marqueur reste littéral, ce qui en fait le témoin parfait : un nom de
 * cache qui le contient est un nom qui bougera à chaque livraison.
 */
const EMPREINTE_DU_BAC = '__EMPREINTE__'
const PREFIXE_APP_ATTENDU = 'sentiers-app-'

describe('le ménage du service worker (#370)', () => {
  it('ne touche pas à ce qu’on a téléchargé pour demain', async () => {
    /*
      L'assertion qui compte. Une randonnée emportée doit survivre à une mise
      à jour de l'application — c'est la seule raison d'être du bouton
      « Emporter », et la seule chose que ce ménage pourrait détruire.
    */
    const { noms } = await activer([])
    const { supprimes } = await activer([
      APP_ANCIEN,
      noms.tuiles,
      noms.terrain,
      noms.app,
    ])

    expect(
      supprimes,
      `Le ménage a supprimé ${noms.terrain} — c'est-à-dire la randonnée que` +
        ` quelqu'un a téléchargée exprès pour partir demain, là où il n'y aura` +
        ` pas de réseau (#370).`,
    ).not.toContain(noms.terrain)

    expect(
      supprimes,
      `Le ménage a supprimé ${noms.tuiles}, le fond de carte déjà consulté.` +
        ` Il est borné à 600 entrées et n'a pas besoin d'être purgé à chaque` +
        ` version.`,
    ).not.toContain(noms.tuiles)
  })

  it('garde aux deux autres caches un nom que l’empreinte ne touche pas', async () => {
    /*
      L'assertion que la précédente ne peut pas faire, et il a fallu une
      injection pour s'en apercevoir.

      Poser l'empreinte sur `CACHE_TERRAIN` ne fait **rien disparaître** : le
      test d'au-dessus lit les noms depuis le bac, voit le nouveau nom, et
      constate qu'il n'est pas supprimé. Il reste vert.

      Le mal est ailleurs. La randonnée déjà enregistrée sous
      `sentiers-v1-terrain` par une version antérieure devient
      **introuvable** : le service worker cherche désormais sous un autre
      nom. Perdue plutôt que supprimée — aussi grave pour qui part demain.

      Ce qui se mesure est donc la **stabilité du nom**, pas l'absence de
      suppression. C'est le §1bis sur mon propre test : il était vert pour
      une raison que je n'avais pas voulue.
    */
    const { noms } = await activer([])

    for (const [role, nom] of [
      ['des randonnées emportées', noms.terrain],
      ['du fond de carte', noms.tuiles],
    ] as const) {
      expect(
        nom.includes(EMPREINTE_DU_BAC) || nom.startsWith(PREFIXE_APP_ATTENDU),
        `Le cache ${role} s'appelle « ${nom} » : son nom dépend de la` +
          ` construction. Ce qui y a été enregistré par une version` +
          ` antérieure devient introuvable à la mise à jour suivante (#370).`,
      ).toBe(false)
    }
  })

  it('emporte le cache d’application de la version précédente', async () => {
    const { noms } = await activer([])
    const { supprimes } = await activer([APP_ANCIEN, noms.app])

    expect(
      supprimes,
      `${APP_ANCIEN} n'a pas été supprimé. C'est le défaut de #370 : les` +
        ` fichiers aux noms hachés changent à chaque construction, donc chaque` +
        ` déploiement ajoute une copie que rien n'enlève.`,
    ).toContain(APP_ANCIEN)
  })

  it('ne se supprime pas lui-même', async () => {
    const { noms } = await activer([])
    const { supprimes } = await activer([noms.app])
    expect(supprimes).not.toContain(noms.app)
  })

  it('donne au cache d’application un nom qui change avec la construction', async () => {
    /*
      Sans ça, tout le reste est décoratif : le ménage peut être parfait, il
      ne se déclenchera jamais. `__EMPREINTE__` est le marqueur que
      `vite.config.ts` remplace au build, exactement comme `__PRECACHE__`.
    */
    const { noms } = await activer([])
    expect(
      noms.app,
      `Le cache d'application s'appelle « ${noms.app} » : un nom qui ne` +
        ` dépend pas de la construction ne change jamais, et le ménage ne` +
        ` trouve donc jamais rien à faire (#370).`,
    ).not.toBe(APP_ANCIEN)
    expect(noms.app.startsWith('sentiers-app-')).toBe(true)
  })
})
