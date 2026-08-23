import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'
import {
  MESSAGE_ARRETER,
  MESSAGE_PROGRES,
  type ProgresTelechargement,
} from '../../src/core/telechargement.ts'

/**
 * Le service worker, exécuté pour de bon (issue #153).
 *
 * Jusqu'ici `public/sw.js` n'était que **relu** : deux tests vérifiaient que
 * les noms de messages n'y dérivaient pas, aucun ne vérifiait qu'il fasse ce
 * qu'il annonce. Or c'est lui qui compte les octets, qui décide qu'une
 * adresse refusée n'arrête pas les autres, et qui doit savoir s'arrêter.
 * Trois comportements qu'aucune relecture n'établit.
 *
 * Le fichier vit hors du bundle et n'exporte rien : on l'évalue avec ses
 * globales remplacées par des doublures, et on lui demande de rendre ses
 * fonctions. C'est le prix à payer pour le tester ; il est plus bas que
 * celui d'un fichier non testé.
 */

interface EntreeCache {
  /** Le cache visé — c'est lui qui dit si la tuile est durable ou non. */
  nom: string
  request: unknown
  reponse: unknown
}

interface Bac {
  precharger(liste: string[], idClient?: string): Promise<void>
  cachePuisReseau(request: unknown, nomCache: string): Promise<unknown>
  /** Ce que le service worker a dit aux pages ouvertes. */
  ditAuxPages: unknown[]
  message(donnees: unknown, idClient?: string): void
  comptesRendus: ProgresTelechargement[]
  mises: EntreeCache[]
  demandees: string[]
}

/** Charge `sw.js` dans un bac à sable et rend de quoi le piloter. */
function chargerServiceWorker(
  reponsePour: (url: string) => { ok: boolean; octets: number } | 'refus',
  dejaEnCache: Record<string, string[]> = {},
): Bac {
  const mises: EntreeCache[] = []
  const demandees: string[] = []
  const comptesRendus: ProgresTelechargement[] = []

  const cachePour = (nom: string) => ({
    put(request: unknown, reponse: unknown) {
      mises.push({ nom, request, reponse })
      return Promise.resolve()
    },
    match: (request: { url: string }) =>
      Promise.resolve(
        (dejaEnCache[nom] ?? []).includes(request.url)
          ? { ok: true, deCache: nom, url: request.url }
          : undefined,
      ),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
    add: () => Promise.resolve(),
  })
  const caches = {
    open: (nom: string) => Promise.resolve(cachePour(nom)),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  }

  const fetchDouble = (request: { url: string }) => {
    demandees.push(request.url)
    const verdict = reponsePour(request.url)
    if (verdict === 'refus') return Promise.reject(new Error('réseau'))
    const corps = new ArrayBuffer(verdict.octets)
    return Promise.resolve({
      ok: verdict.ok,
      type: 'basic',
      clone: () => ({ arrayBuffer: () => Promise.resolve(corps) }),
    })
  }

  class RequeteDouble {
    url: string
    method = 'GET'
    constructor(url: string) {
      this.url = url
    }
  }

  const ditAuxPages: unknown[] = []
  const pageOuverte = {
    postMessage: (message: unknown) => {
      ditAuxPages.push(message)
    },
  }
  const ecouteursMessage: ((event: unknown) => void)[] = []
  const self = {
    __PRECACHE__: [] as string[],
    location: { origin: 'https://exemple.test' },
    addEventListener(type: string, ecouteur: (event: unknown) => void) {
      if (type === 'message') ecouteursMessage.push(ecouteur)
    },
    skipWaiting: () => Promise.resolve(),
    clients: {
      matchAll: () => Promise.resolve([pageOuverte]),
      claim: () => Promise.resolve(),
    },
  }

  /*
    `no-implied-eval` garde contre l'évaluation d'une chaîne venue du
    dehors. Celle-ci vient de `public/sw.js`, lu par le bundler au moment du
    test : c'est le fichier du dépôt, pas une entrée. La règle est désactivée
    ici et nulle part ailleurs.
  */
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fabrique = new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    `${swSource}\nreturn { precharger, cachePuisReseau }`,
  ) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    Request: unknown,
  ) => {
    /* La vraie signature du service worker : une liste, et le client qui a
       demandé — c'est lui qui pourra demander l'arrêt. */
    precharger: (liste: string[], source: unknown) => Promise<void>
    cachePuisReseau: Bac['cachePuisReseau']
  }

  const { precharger, cachePuisReseau } = fabrique(
    self,
    caches,
    fetchDouble,
    RequeteDouble,
  )

  const source = {
    postMessage(message: { type?: string } & ProgresTelechargement) {
      if (message.type === MESSAGE_PROGRES) {
        const { faites, total, octets, echecs, fini } = message
        comptesRendus.push({ faites, total, octets, echecs, fini })
      }
    },
  }

  return {
    precharger: (liste, idClient = 'onglet-a') =>
      precharger(liste, { ...source, id: idClient }),
    cachePuisReseau,
    ditAuxPages,
    message(donnees, idClient = 'onglet-a') {
      for (const ecouteur of ecouteursMessage)
        ecouteur({
          data: donnees,
          waitUntil: () => undefined,
          source: { ...source, id: idClient },
        })
    },
    comptesRendus,
    mises,
    demandees,
  }
}

const TUILE = 'https://data.geopf.fr/wmts?TILEMATRIX=12&TILECOL=1&TILEROW=1'
const AUTRE = 'https://data.geopf.fr/wmts?TILEMATRIX=12&TILECOL=2&TILEROW=1'
const PROFIL = 'https://data.geopf.fr/altimetrie/1.0.0/calcul/alti/rest/elevationLine.json?lon=5&lat=45'

describe('le service worker emporte une randonnée', () => {
  it('compte les octets réellement reçus, adresse par adresse', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 2_000 }))
    await bac.precharger([TUILE, AUTRE])
    expect(bac.comptesRendus).toEqual([
      { faites: 1, total: 2, octets: 2_000, echecs: 0, fini: false },
      { faites: 2, total: 2, octets: 4_000, echecs: 0, fini: true },
    ])
  })

  /** Trois carrés gris valent mieux qu'un bouton qui abandonne au premier. */
  it('poursuit après une adresse refusée, et la compte', async () => {
    const bac = chargerServiceWorker((url) =>
      url === AUTRE ? 'refus' : { ok: true, octets: 1_500 },
    )
    await bac.precharger([TUILE, AUTRE, PROFIL])
    expect(bac.demandees).toHaveLength(3)
    expect(bac.comptesRendus.at(-1)).toEqual({
      faites: 3,
      total: 3,
      octets: 3_000,
      echecs: 1,
      fini: true,
    })
  })

  it('range le profil altimétrique, qui n’est pas une tuile', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 10 }))
    await bac.precharger([PROFIL])
    expect(bac.mises).toHaveLength(1)
  })

  /**
   * Le défaut que ce test a trouvé, et pourquoi il compte.
   *
   * Les tuiles préchargées allaient dans le cache de navigation, borné à
   * 600 entrées et **taillé du plus ancien** à chaque tuile consultée
   * ensuite. Autrement dit : on emportait 104 tuiles, on ouvrait la carte,
   * et une partie de ce qu'on croyait avoir en poche disparaissait sans
   * rien dire — le bouton affichait « Emportée » et c'était faux.
   *
   * Ce qu'on a emporté exprès va donc dans le cache de terrain, qui n'est
   * pas taillé. C'est la contrepartie assumée : ce cache grossit, et il ne
   * se vide que quand on efface les données du site.
   */
  it('met à l’abri du ménage ce qu’on a emporté', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 10 }))
    await bac.precharger([TUILE, AUTRE, PROFIL])
    expect(bac.mises).toHaveLength(3)
    for (const mise of bac.mises) {
      expect(mise.nom).toContain('terrain')
      expect(mise.nom).not.toContain('tuiles')
    }
  })

  /**
   * Le corridor d'un GR de 200 km compte des milliers de tuiles : sans ce
   * message, le bouton serait un piège sans retour.
   */
  it('s’arrête quand on le lui demande, et le dit', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 100 }))
    const liste = Array.from(
      { length: 50 },
      (_, i) => `https://data.geopf.fr/wmts?TILECOL=${String(i)}`,
    )
    const course = bac.precharger(liste)
    bac.message({ type: MESSAGE_ARRETER })
    await course
    expect(bac.demandees.length).toBeLessThan(50)
    expect(bac.comptesRendus.at(-1)?.fini).toBe(true)
  })

  /**
   * Le pendant du test précédent : une fois rangée ailleurs, la tuile doit
   * encore être trouvée quand la carte la redemande — sans quoi on aurait
   * déplacé le problème au lieu de le résoudre.
   */
  it('ressert la tuile emportée quand la carte la redemande', async () => {
    const bac = chargerServiceWorker(
      () => 'refus',
      { 'sentiers-v1-terrain': [TUILE] },
    )
    const servie = (await bac.cachePuisReseau(
      { url: TUILE, method: 'GET' },
      'sentiers-v1-tuiles',
    )) as { deCache?: string }
    expect(servie.deCache).toBe('sentiers-v1-terrain')
    expect(bac.demandees).toHaveLength(0)
  })

  /**
   * Et il ne faut pas que ce service passe pour une panne : le bandeau
   * « Hors connexion » apparaîtrait en pleine connexion, dès qu'on regarde
   * une randonnée emportée.
   */
  it('ne fait pas passer une tuile emportée pour un secours', async () => {
    const bac = chargerServiceWorker(
      () => 'refus',
      { 'sentiers-v1-terrain': [TUILE] },
    )
    await bac.cachePuisReseau({ url: TUILE, method: 'GET' }, 'sentiers-v1-tuiles')
    expect(bac.ditAuxPages).toHaveLength(0)
  })

  /**
   * L'arrêt vise l'onglet qui l'a demandé, et lui seul.
   *
   * Avec un simple drapeau global, refermer une fiche dans un onglet
   * interrompait le téléchargement lancé dans un autre — qui affichait
   * alors « Emportée » sur une randonnée incomplète. Un mot faux, pour une
   * raison qu'on ne pouvait pas voir depuis cet onglet-là.
   */
  it('n’arrête que l’onglet qui le demande', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 100 }))
    const liste = Array.from(
      { length: 30 },
      (_, i) => `https://data.geopf.fr/wmts?TILECOL=${String(i)}`,
    )
    const course = bac.precharger(liste, 'onglet-b')
    bac.message({ type: MESSAGE_ARRETER }, 'onglet-a')
    await course
    expect(bac.demandees).toHaveLength(30)
    expect(bac.comptesRendus.at(-1)).toMatchObject({ faites: 30, fini: true })
  })

  it('rend compte même d’une liste vide', async () => {
    const bac = chargerServiceWorker(() => ({ ok: true, octets: 1 }))
    await bac.precharger([])
    expect(bac.comptesRendus).toEqual([
      { faites: 0, total: 0, octets: 0, echecs: 0, fini: true },
    ])
  })
})
