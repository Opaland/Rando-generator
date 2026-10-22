import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../src/store/appStore.ts'

/**
 * Trouvé par la vague de mutation du 17/10 sur appStore.ts : les deux
 * lignes qui transmettent une position (ou une erreur) du navigateur à
 * l'enregistrement en cours — `sortie.surPosition(position)` et
 * `sortie.surErreurGeo(erreur)` — n'étaient appelées par aucun test.
 *
 * `tests/unit/suiviDePosition.test.ts` couvre le même rappel, mais ne
 * regarde que ce que la carte en fait (`userPosition`, `focusTarget`) :
 * ces deux lignes-là auraient pu disparaître sans qu'il s'en aperçoive,
 * puisqu'une sortie en cours n'enregistrerait alors plus aucun point.
 * `tests/unit/enregistrementSlice.test.ts` éprouve `surPosition` et
 * `surErreurGeo` directement sur la tranche, avec des ports factices —
 * jamais à travers le rappel réel que `appStore.ts` pose sur le
 * navigateur.
 */

let surPosition: ((position: GeolocationPosition) => void) | null = null
let surErreur: ((erreur: GeolocationPositionError) => void) | null = null

function poserUneGeolocalisation(): void {
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
      clearWatch: () => undefined,
    },
  })
}

function position(lon: number, lat: number): GeolocationPosition {
  return {
    coords: { longitude: lon, latitude: lat, accuracy: 10, altitude: null },
    timestamp: 1_700_000_000_000,
  } as GeolocationPosition
}

beforeEach(() => {
  surPosition = null
  surErreur = null
  poserUneGeolocalisation()
})

afterEach(async () => {
  // Libère la veille partagée ('sortie'), sans produire de trace : sinon le
  // compteur de demandeurs du singleton `veilleGeo` reste ouvert pour le
  // test suivant de ce même fichier.
  if (useAppStore.getState().enregistrement.etat !== 'repos') {
    await useAppStore.getState().abandonnerSortie()
  }
  vi.unstubAllGlobals()
})

describe('ce que l’enregistrement en cours fait d’une position reçue', () => {
  it('ajoute le point reçu du navigateur à la sortie en cours', () => {
    useAppStore.getState().demarrerSortie()
    expect(surPosition).not.toBeNull()

    surPosition?.(position(4.8, 45.75))

    expect(useAppStore.getState().enregistrement.points).toHaveLength(1)
  })

  it('met la sortie en pause et dit l’erreur, sur une erreur GPS', () => {
    useAppStore.getState().demarrerSortie()
    surPosition?.(position(4.8, 45.75))

    surErreur?.({ code: 1, message: 'refusé' } as GeolocationPositionError)

    const etat = useAppStore.getState()
    expect(etat.enregistrement.etat).toBe('pause')
    expect(etat.sortieErreur).not.toBeNull()
  })
})
