import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  ElevationProfile,
  Itinerary,
  PointOfInterest,
} from '../../src/core/types.ts'

/**
 * La tranche « fiche détail » du store (issue #155).
 *
 * Ces tests gardent ce qu'un test de bout en bout ne peut pas tenir :
 * **l'ordre d'arrivée de deux réponses réseau**. Ouvrir deux fiches coup sur
 * coup lance deux requêtes de profil altimétrique, et rien ne garantit que la
 * première réponde en premier. Sans le numéro d'ordre, la réponse tardive de
 * la fiche abandonnée écrase celle qu'on regarde — un profil de 12 km affiché
 * sous le nom d'un sentier de 3.
 *
 * Un test de bout en bout ne peut pas le provoquer à coup sûr : il faudrait
 * que le réseau se décide à répondre dans le mauvais ordre. Ici, on décide.
 */

/** Les promesses de profil en attente, que le test résout dans l'ordre voulu. */
const profilsEnAttente: {
  resoudre: (p: ElevationProfile) => void
  rejeter: (e: unknown) => void
}[] = []

vi.mock('../../src/core/elevation.ts', async () => {
  const vrai = await vi.importActual<
    typeof import('../../src/core/elevation.ts')
  >('../../src/core/elevation.ts')
  return {
    ...vrai,
    fetchElevationProfile: () =>
      new Promise<ElevationProfile>((resolve, reject) => {
        profilsEnAttente.push({ resoudre: resolve, rejeter: reject })
      }),
  }
})

let poisDuReseau: PointOfInterest[] | null = []

vi.mock('../../src/core/poi.ts', async () => {
  const vrai = await vi.importActual<typeof import('../../src/core/poi.ts')>(
    '../../src/core/poi.ts',
  )
  return { ...vrai, fetchPoisOuEchec: () => Promise.resolve(poisDuReseau) }
})

const { trancheFiche, FICHE_FERMEE } =
  await import('../../src/store/trancheFiche.ts')
type EtatFiche = import('../../src/store/trancheFiche.ts').EtatFiche

function itineraire(id: number, points: number): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name: `itinéraire ${String(id)}`,
    network: 'GR',
    ways: [
      {
        osmWayId: id,
        coords: Array.from({ length: points }, (_, i) => [
          4.5 + i * 0.01,
          45.4,
        ]),
      },
    ],
    totalMeters: points * 100,
    fetchedAt: '2026-08-24T00:00:00.000Z',
  }
}

function profil(nombre: number): ElevationProfile {
  return {
    elevations: Array.from({ length: nombre }, (_, i) => 800 + i),
    distances: Array.from({ length: nombre }, (_, i) => i * 100),
  } as unknown as ElevationProfile
}

function banc(itineraires: Itinerary[]) {
  let etat: EtatFiche & { selectedItineraryId: number | null } = {
    ...FICHE_FERMEE,
    focusTarget: null,
    focusBounds: null,
    selectedItineraryId: null,
  }
  const actions = trancheFiche({
    set: (partiel) => {
      etat = { ...etat, ...partiel }
    },
    etatFiche: () => etat,
    itineraireParId: (id) => itineraires.find((i) => i.osmRelationId === id),
    poisEmportes: () => Promise.resolve(null),
  })
  return { actions, etat: () => etat }
}

/** Laisse les promesses déjà résolues s'écouler. */
async function laisserPasser(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('deux fiches ouvertes coup sur coup', () => {
  beforeEach(() => {
    profilsEnAttente.length = 0
    poisDuReseau = []
  })

  it('la réponse de la fiche abandonnée n’écrase pas celle qu’on regarde', async () => {
    const b = banc([itineraire(1, 3), itineraire(2, 5)])
    b.actions.openItineraryDetail(1)
    b.actions.openItineraryDetail(2)
    expect(profilsEnAttente).toHaveLength(2)

    // La première répond **après** la seconde : le pire ordre, et le seul
    // qui distingue une garde d'un vœu pieux.
    profilsEnAttente[1]?.resoudre(profil(5))
    await laisserPasser()
    profilsEnAttente[0]?.resoudre(profil(3))
    await laisserPasser()

    expect(b.etat().detailItineraryId).toBe(2)
    expect(
      b.etat().elevationProfile?.elevations,
      'le profil de la fiche abandonnée a écrasé celui qu’on regarde',
    ).toHaveLength(5)
  })

  it('une réponse arrivée après la fermeture ne rouvre rien', async () => {
    const b = banc([itineraire(1, 3)])
    b.actions.openItineraryDetail(1)
    b.actions.closeItineraryDetail()
    profilsEnAttente[0]?.resoudre(profil(3))
    await laisserPasser()

    expect(b.etat().detailItineraryId).toBeNull()
    expect(b.etat().elevationProfile).toBeNull()
    expect(b.etat().elevationLoading).toBe(false)
  })

  /**
   * Le cas que la vague de mutation a démasqué.
   *
   * `encoreLa()` tient deux conditions : le numéro d'ordre **et**
   * l'identifiant encore ouvert. Remplacer le `&&` par un `||` survivait à
   * tous les tests — parce qu'aucun ne rouvrait **la même** fiche.
   *
   * Or c'est le geste le plus banal du monde : on ouvre un itinéraire, on
   * referme d'un doigt maladroit, on rouvre le même. La première requête
   * revient alors sur une fiche dont l'identifiant correspond, et seul le
   * numéro d'ordre la distingue. Avec un `ou`, elle écrase ce qui est en
   * train de se charger.
   */
  it('rouvrir le même itinéraire n’accepte pas la réponse du premier tour', async () => {
    const b = banc([itineraire(1, 3)])
    b.actions.openItineraryDetail(1)
    b.actions.closeItineraryDetail()
    b.actions.openItineraryDetail(1)
    expect(profilsEnAttente).toHaveLength(2)

    // La réponse du **premier** tour revient, sur une fiche qui porte le même
    // identifiant. Seul le numéro d'ordre peut la refuser.
    profilsEnAttente[0]?.resoudre(profil(9))
    await laisserPasser()
    expect(
      b.etat().elevationProfile,
      'la réponse d’un tour abandonné s’est posée sur la fiche rouverte',
    ).toBeNull()
    expect(b.etat().elevationLoading).toBe(true)

    // Et celle du second tour, elle, est bien acceptée.
    profilsEnAttente[1]?.resoudre(profil(3))
    await laisserPasser()
    expect(b.etat().elevationProfile?.elevations).toHaveLength(3)
  })

  it('une erreur de la fiche abandonnée ne s’affiche pas sur la suivante', async () => {
    const b = banc([itineraire(1, 3), itineraire(2, 5)])
    b.actions.openItineraryDetail(1)
    b.actions.openItineraryDetail(2)
    profilsEnAttente[0]?.rejeter(new Error('réseau'))
    await laisserPasser()
    expect(b.etat().elevationError).toBeNull()
    expect(b.etat().elevationLoading).toBe(true)
  })
})

/**
 * Les points d'intérêt, et ce que la vague de mutation a montré non couvert.
 *
 * `choisirPois` tranche entre le réseau et la réserve, et la fiche doit dire
 * **d'où** viennent les points : un point d'eau emporté il y a trois mois peut
 * avoir été supprimé ou tari. Aucun test n'assertait la source — quinze
 * mutants survivaient dans cette branche.
 */
describe('d’où viennent les points d’intérêt', () => {
  beforeEach(() => {
    profilsEnAttente.length = 0
    poisDuReseau = []
  })

  it('dit « réseau » quand Overpass répond', async () => {
    poisDuReseau = [
      {
        id: 1,
        kind: 'water',
        name: 'Fontaine',
        lon: 4.5,
        lat: 45.4,
      } as unknown as PointOfInterest,
    ]
    const b = banc([itineraire(1, 3)])
    b.actions.openItineraryDetail(1)
    await laisserPasser()
    expect(b.etat().pois).toHaveLength(1)
    expect(b.etat().poisSource).toBe('reseau')
    expect(b.etat().poisRecuperesLe).toBeNull()
    expect(b.etat().poisLoading).toBe(false)
  })

  /**
   * Overpass muet **et** rien en réserve : la fiche l'avoue plutôt que de
   * montrer une liste vide qui se lirait « il n'y a pas d'eau ici ».
   */
  it('dit « aucune » quand ni le réseau ni la réserve ne répondent', async () => {
    poisDuReseau = null
    const b = banc([itineraire(1, 3)])
    b.actions.openItineraryDetail(1)
    await laisserPasser()
    expect(b.etat().poisSource).toBe('aucune')
    expect(b.etat().poisLoading).toBe(false)
  })

  /**
   * Deux points, c'est déjà un itinéraire : le mutant qui passait `< 2` à
   * `<= 2` refusait d'en demander le profil, et personne ne s'en apercevait.
   */
  it('un itinéraire de deux points a droit à son profil', () => {
    const b = banc([itineraire(1, 2)])
    b.actions.openItineraryDetail(1)
    expect(profilsEnAttente).toHaveLength(1)
    expect(b.etat().elevationLoading).toBe(true)
  })
})

describe('la fiche ne garde rien de la précédente', () => {
  beforeEach(() => {
    profilsEnAttente.length = 0
    poisDuReseau = []
  })

  /**
   * `FICHE_FERMEE` existe parce que dix champs étaient remis à zéro dans
   * quatre endroits. Ce test compare l'état à la table plutôt que champ par
   * champ : un champ ajouté demain et oublié dans la remise à zéro le fait
   * rougir, ce qu'une liste d'assertions recopiée n'aurait pas fait.
   */
  it('fermer rend exactement l’état « fermée »', async () => {
    const b = banc([itineraire(1, 3)])
    b.actions.openItineraryDetail(1)
    profilsEnAttente[0]?.resoudre(profil(3))
    await laisserPasser()
    b.actions.toggleView3D()
    expect(b.etat().view3D).toBe(true)

    b.actions.closeItineraryDetail()
    const { focusTarget, focusBounds, selectedItineraryId, ...fiche } = b.etat()
    /*
      En toutes lettres, et non `toEqual(FICHE_FERMEE)` : comparer l'état à la
      table qu'on prétend vérifier laisse passer toute erreur dans la table.
      La vague de mutation l'a montré — `pois: []`, `poisLoading: false` et
      `poisSource: 'aucune'` faussés ont tous les trois survécu (§1).
    */
    expect(fiche).toEqual({
      detailItineraryId: null,
      elevationProfile: null,
      elevationError: null,
      elevationLoading: false,
      elevationHover: null,
      pois: [],
      poisLoading: false,
      poisSource: 'aucune',
      poisRecuperesLe: null,
      view3D: false,
    })
    // La sélection survit : fermer la fiche ne désélectionne pas la ligne.
    expect(selectedItineraryId).toBe(1)
    expect(focusTarget).toBeNull()
    expect(focusBounds).toBeNull()
  })

  /**
   * Les cibles de cadrage ne sont **pas** dans la table, et c'est délibéré :
   * elles se consomment une fois, à l'initiative de la carte, et fermer une
   * fiche n'a jamais annulé un cadrage demandé. Ce test dit ce choix, pour
   * qu'on ne le « range » pas un jour par symétrie.
   */
  it('fermer la fiche n’annule pas un cadrage demandé', () => {
    const b = banc([itineraire(1, 3)])
    b.actions.focusOnBounds([
      [4.5, 45.4],
      [4.6, 45.5],
    ])
    b.actions.openItineraryDetail(1)
    b.actions.closeItineraryDetail()
    expect(b.etat().focusBounds).not.toBeNull()
  })

  it('ouvrir un itinéraire trop court ne laisse pas les chargements en cours', () => {
    const b = banc([itineraire(1, 1)])
    b.actions.openItineraryDetail(1)
    expect(b.etat().elevationLoading).toBe(false)
    expect(b.etat().poisLoading).toBe(false)
    expect(profilsEnAttente).toHaveLength(0)
  })
})
