import { describe, it, expect, vi } from 'vitest'
import {
  trancheZone,
  type DependancesZone,
} from '../../src/store/trancheZone.ts'

/*
  `fetchPois` part sur Overpass. Ici on ne veut pas de l'appel, on veut
  savoir **s'il a lieu** — et le compter.

  Le neutraliser n'est pas du décor : sans cela, le mutant que ce fichier
  vise déclencherait une vraie requête réseau, et le test échouerait pour
  une raison qu'on n'a pas voulue (§1bis).
*/
const appelsFetchPois = { n: 0 }
vi.mock('../../src/core/poi.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/poi.ts')>(
      '../../src/core/poi.ts',
    )
  return {
    ...vrai,
    fetchPois: () => {
      appelsFetchPois.n += 1
      return Promise.resolve([])
    },
  }
})

/**
 * Les points d'intérêt d'une zone, et l'annulation d'un chargement.
 *
 * Deux actions de `trancheZone.ts` que la vague du 30/08 (#428) a montrées
 * **sans un seul mutant couvert** : `chargerPoisDeLaZone` (lignes 410-427) et
 * `cancelZoneLoad` (443-447). Elles passent par les tests de bout en bout,
 * que la mutation ne lance pas.
 */

interface Etat {
  itineraries: unknown[]
  poisZoneLoading: boolean
  zoneLoading: boolean
  zoneLoadStage: string | null
  zoneLoadBytes: number
}

function tranche(depart: Partial<Etat> = {}) {
  let etat: Etat = {
    itineraries: [],
    poisZoneLoading: false,
    zoneLoading: false,
    zoneLoadStage: null,
    zoneLoadBytes: 0,
    ...depart,
  }
  const ecritures: Partial<Etat>[] = []
  const deps = {
    set: (partiel: Partial<Etat> | ((e: Etat) => Partial<Etat>)) => {
      const suite = typeof partiel === 'function' ? partiel(etat) : partiel
      ecritures.push(suite)
      etat = { ...etat, ...suite }
    },
    etat: () => etat,
    baseOuverte: () => Promise.resolve(null),
    persistLastZone: () => Promise.resolve(),
    recompute: () => Promise.resolve(),
    setItineraries: () => {},
    sortirDeLaDemonstration: () => Promise.resolve(),
  } as unknown as DependancesZone

  return { actions: trancheZone(deps), ecritures, lire: () => etat }
}

/** Un itinéraire minimal : de quoi que `itineraryCoords` rende des points. */
function itineraire() {
  return {
    osmRelationId: 1,
    name: 'GR 7',
    network: 'GR',
    ways: [
      {
        osmWayId: 10,
        coords: [
          [4.5, 45.4],
          [4.51, 45.41],
        ],
      },
    ],
  }
}

describe('charger les points d’intérêt de la zone', () => {
  it('ne repart pas quand une requête est déjà en vol', async () => {
    /*
      La garde est `poisZoneLoading || itineraries.length === 0`.

      En `&&`, elle ne rejette que si les **deux** sont vrais : une seconde
      demande partirait pendant que la première est en vol. Overpass nous
      répond 429 pour moins que ça — le dépôt a des issues entières là-dessus
      (#336, #406) — et la seconde réponse écraserait la première.
    */
    appelsFetchPois.n = 0
    const { actions, ecritures } = tranche({
      itineraries: [itineraire()],
      poisZoneLoading: true,
    })

    await actions.chargerPoisDeLaZone()

    expect(
      appelsFetchPois.n,
      'une requête était déjà en vol : en lancer une seconde, c’est doubler' +
        ' les appels à un service qui nous limite',
    ).toBe(0)
    expect(ecritures, 'la garde doit sortir avant toute écriture').toEqual([])
  })

  it('ne demande rien quand la zone n’a aucun itinéraire', async () => {
    // L'autre moitié de la même garde : sans elle, on interrogerait Overpass
    // avec une liste de coordonnées vide.
    appelsFetchPois.n = 0
    const { actions, ecritures } = tranche({ itineraries: [] })

    await actions.chargerPoisDeLaZone()

    expect(appelsFetchPois.n).toBe(0)
    expect(ecritures).toEqual([])
  })

  it('demande, et repose le drapeau quand c’est fini', async () => {
    /*
      Le pendant, sans lequel les deux tests précédents seraient contents
      d'un `chargerPoisDeLaZone` qui ne ferait **jamais** rien.
    */
    appelsFetchPois.n = 0
    const { actions, lire } = tranche({ itineraries: [itineraire()] })

    await actions.chargerPoisDeLaZone()

    expect(appelsFetchPois.n).toBe(1)
    expect(
      lire().poisZoneLoading,
      'le drapeau doit retomber : laissé à `true`, il interdirait toute' +
        ' demande ultérieure — la garde ci-dessus s’en chargerait',
    ).toBe(false)
  })
})

describe('annuler un chargement de zone', () => {
  it('rend la main tout de suite, et invalide ce qui est en vol', () => {
    /*
      `cancelZoneLoad` incrémente une séquence : la promesse en cours
      continue en arrière-plan — le cache en profitera si elle aboutit — mais
      ne touchera plus l'écran.

      On mesure ici la moitié observable : l'état de chargement retombe
      immédiatement. La seconde moitié — la séquence — est ce que le mutant
      `zoneLoadSequence` intact mais `set` retiré ferait tomber.
    */
    const { actions, lire } = tranche({
      zoneLoading: true,
      zoneLoadStage: 'itinéraires',
      zoneLoadBytes: 12_345,
    })

    actions.cancelZoneLoad()

    expect(lire().zoneLoading).toBe(false)
    expect(lire().zoneLoadStage).toBeNull()
    expect(
      lire().zoneLoadBytes,
      'le compteur d’octets doit repartir de zéro : laissé tel quel, le' +
        ' chargement suivant afficherait le poids du précédent',
    ).toBe(0)
  })
})
