import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Le point bleu et le premier cadrage (issue #480).
 *
 * `toggleGeolocation` n'était appelée par **aucun** test unitaire : la vague
 * de mutation complète a compté 38 mutants sans couverture sur ce seul
 * chemin — celui de la fonction qu'on utilise en marchant, et la seule qu'on
 * consulte quand on ne sait plus où l'on est.
 *
 * Rien n'obligeait à passer par un navigateur : la veille lit
 * `'geolocation' in navigator` **à l'appel**, pas à l'import. Une doublure
 * posée avant suffit, et c'est ce que fait `poserUneGeolocalisation`.
 */

/** Le rappel que le store a confié au navigateur, s'il en a confié un. */
let surPosition: ((position: GeolocationPosition) => void) | null = null
let surErreur: ((erreur: GeolocationPositionError) => void) | null = null
let suivisArretes: number[] = []

/** Une géolocalisation qui répond, et qui note ce qu'on lui demande. */
function poserUneGeolocalisation(disponible = true): void {
  if (!disponible) {
    // Un objet sans `geolocation` : `'geolocation' in navigator` rend faux,
    // exactement comme un navigateur qui ne la fournit pas.
    vi.stubGlobal('navigator', {})
    return
  }
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (
        ok: (position: GeolocationPosition) => void,
        ko: (erreur: GeolocationPositionError) => void,
      ) => {
        surPosition = ok
        surErreur = ko
        return 42
      },
      clearWatch: (id: number) => suivisArretes.push(id),
    },
  })
}

function position(lon: number, lat: number): GeolocationPosition {
  return {
    coords: { longitude: lon, latitude: lat, accuracy: 12 },
    timestamp: 1_700_000_000_000,
  } as GeolocationPosition
}

const AU_REPOS = { userPosition: null, geoError: null, focusTarget: null }

beforeEach(() => {
  surPosition = null
  surErreur = null
  suivisArretes = []
  useAppStore.setState(AU_REPOS)
})

/**
 * Rendre le suivi par où on l'a pris, plutôt que de reposer `geoWatching`.
 *
 * La veille est un **singleton de module** : son compte de demandeurs et son
 * identifiant de suivi survivent à un `setState`, et `demarrer` fait
 * `identifiant ??= watchPosition(…)`. Remettre `geoWatching` à faux à la
 * main laissait donc le suivi ouvert — le test suivant appelait
 * `toggleGeolocation`, la veille se croyait déjà ouverte, et **aucun rappel
 * n'était posé**. Deux questions passaient alors sur un `surPosition?.()`
 * qui ne faisait rien.
 *
 * Un harnais plus permissif que la réalité rend un test vert pour une raison
 * qu'on n'a pas voulue (§1bis). Il faut éteindre par l'action, pas par
 * l'état — et avant de retirer la doublure, pour que `clearWatch` la trouve.
 */
afterEach(() => {
  if (useAppStore.getState().geoWatching) {
    useAppStore.getState().toggleGeolocation()
  }
  vi.unstubAllGlobals()
  useAppStore.setState(AU_REPOS)
})

describe('allumer et éteindre le suivi de position', () => {
  it('dit qu’il ne peut pas suivre quand le navigateur ne localise pas', () => {
    poserUneGeolocalisation(false)

    useAppStore.getState().toggleGeolocation()

    const etat = useAppStore.getState()
    expect(etat.geoWatching).toBe(false)
    expect(etat.geoError).toMatch(/localisation/i)
  })

  it('suit, et sans erreur, quand le navigateur localise', () => {
    poserUneGeolocalisation()

    useAppStore.getState().toggleGeolocation()

    expect(useAppStore.getState().geoWatching).toBe(true)
    expect(useAppStore.getState().geoError).toBeNull()
    expect(surPosition).not.toBeNull()
  })

  /**
   * Un point bleu figé sur une position d'il y a une heure est **pire**
   * qu'aucun point : il a l'air à jour. En montagne, c'est la différence
   * entre « je ne sais pas où je suis » et « je crois savoir, et je me
   * trompe ».
   */
  it('efface la position en éteignant, et relâche le suivi', () => {
    poserUneGeolocalisation()
    useAppStore.getState().toggleGeolocation()
    surPosition?.(position(4.8, 45.75))
    expect(useAppStore.getState().userPosition).not.toBeNull()

    useAppStore.getState().toggleGeolocation()

    expect(useAppStore.getState().geoWatching).toBe(false)
    expect(useAppStore.getState().userPosition).toBeNull()
    expect(suivisArretes).toEqual([42])
  })
})

describe('ce que la carte fait d’une position reçue', () => {
  /**
   * La promesse du commentaire d'`appStore.ts` : « on ne recentre qu'au
   * premier point ; recentrer à chaque relevé arracherait la carte des mains
   * de qui la déplace ». Un commentaire qui justifie est une affirmation
   * (§4bis) — celle-ci est désormais tenue.
   */
  it('recentre au premier point, et ne recentre plus ensuite', () => {
    poserUneGeolocalisation()
    useAppStore.getState().toggleGeolocation()

    surPosition?.(position(4.8, 45.75))
    expect(useAppStore.getState().focusTarget).toEqual([4.8, 45.75])

    // La personne a déplacé la carte : la cible de cadrage est consommée.
    useAppStore.getState().clearFocusTarget()
    surPosition?.(position(4.81, 45.76))

    expect(useAppStore.getState().focusTarget).toBeNull()
    // La position, elle, suit bien le second relevé.
    expect(useAppStore.getState().userPosition).toMatchObject({
      lon: 4.81,
      lat: 45.76,
    })
  })

  /**
   * Un relevé peut arriver après l'extinction — le navigateur n'arrête pas
   * toujours net. Sans la garde, il ressusciterait le point bleu que la
   * personne vient de retirer.
   */
  it('ignore une position arrivée après l’extinction', () => {
    poserUneGeolocalisation()
    useAppStore.getState().toggleGeolocation()
    useAppStore.getState().toggleGeolocation()

    surPosition?.(position(4.8, 45.75))

    expect(useAppStore.getState().userPosition).toBeNull()
    expect(useAppStore.getState().focusTarget).toBeNull()
  })

  it('éteint le suivi et efface la position sur une erreur GPS', () => {
    poserUneGeolocalisation()
    useAppStore.getState().toggleGeolocation()
    surPosition?.(position(4.8, 45.75))

    surErreur?.({ code: 1, message: 'refusé' } as GeolocationPositionError)

    const etat = useAppStore.getState()
    expect(etat.geoWatching).toBe(false)
    expect(etat.userPosition).toBeNull()
    expect(etat.geoError).not.toBeNull()
  })
})
