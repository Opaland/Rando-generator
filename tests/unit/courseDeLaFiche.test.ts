// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ElevationError } from '../../src/core/elevation.ts'
import type { Itinerary, LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Deux fiches ouvertes coup sur coup : la réponse de la première ne doit pas
 * parler à la place de la seconde.
 *
 * ## D'où vient ce fichier
 *
 * De la vague du 31/08 : `trancheFiche.ts` reste le maillon faible du store
 * (72,31 %), et tous ses mutants non tués se rangent en deux tas. Celui-ci
 * couvre le premier, la course — l'autre, les quatre gestes de la carte, est
 * un lot à part.
 *
 * Le commentaire de `trancheFiche.ts:125` porte la règle : « rien ne
 * garantit que la première réponde en premier, et sans ce compteur la
 * réponse tardive de la fiche abandonnée écraserait celle qu'on regarde ».
 * C'était une affirmation, et le §4bis dit ce que valent celles qu'on ne
 * relit pas : aucun test ne la vérifiait.
 *
 * ## La garde a deux moitiés, et une seule était éprouvée
 *
 *     courante === sequence && deps.etatFiche().detailItineraryId === id
 *
 * Un `||` laisse passer une réponse qui satisfait **l'une des deux**. Les
 * deux cas sont distincts et se ferment autrement :
 *
 * - une **seconde fiche** ouverte fait avancer le compteur ; l'identifiant,
 *   lui, a changé aussi — c'est la moitié gauche qui décide en premier ;
 * - une fiche **fermée puis rouverte sur le même itinéraire** rend
 *   l'identifiant identique et seul le compteur diffère.
 *
 * ## Un survivant qui en est vraiment un
 *
 * `closeItineraryDetail` fait avancer `sequence`, et son commentaire dit
 * pourquoi : « une réponse encore en vol ne rouvrira rien ». Retirer cette
 * ligne ne fait rougir aucun test de ce fichier, et **c'est justifié** :
 * `FICHE_FERMEE` remet `detailItineraryId` à `null`, donc la moitié droite
 * arrête déjà tout ce qui reviendrait. Une réouverture, elle, fait avancer
 * le compteur d'elle-même.
 *
 * Le commentaire est donc vrai mais ne porte pas : ce qui empêche la
 * réouverture est `FICHE_FERMEE`, pas le compteur. La ligne reste — retirer
 * une garde de plus sur une course n'est pas un gain —, mais elle est
 * écrite ici comme équivalente pour qu'on ne la rechasse pas à la vague
 * suivante (§6bis).
 *
 * Il faut donc deux scénarios, pas un — et un troisième que le premier jet
 * avait manqué : `quitterDemonstration` ferme la fiche en écrivant
 * `detailItineraryId: null` **sans** faire avancer le compteur
 * (`trancheDemonstration.ts:170`). C'est le seul endroit où la moitié droite
 * est la seule à décider, et sans ce cas j'aurais rangé son mutant parmi les
 * équivalents — à tort.
 */

/** Ce que chaque service rendra, décidé test par test. */
let profil: () => Promise<{ points: unknown[] }>
let poisReseau: () => Promise<PointOfInterest[] | null>

vi.mock('../../src/core/elevation.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/elevation.ts')>(
      '../../src/core/elevation.ts',
    )
  return { ...vrai, fetchElevationProfile: () => profil() }
})

vi.mock('../../src/core/poi.ts', async () => {
  const vrai =
    await vi.importActual<typeof import('../../src/core/poi.ts')>(
      '../../src/core/poi.ts',
    )
  return { ...vrai, fetchPoisOuEchec: () => poisReseau() }
})

const { trancheFiche } = await import('../../src/store/trancheFiche.ts')
type Deps = Parameters<typeof trancheFiche>[0]

/** Une promesse dont le test décide quand — et comment — elle aboutit. */
function differee<T>() {
  let tenir: (v: T) => void = () => undefined
  let rompre: (e: unknown) => void = () => undefined
  const promesse = new Promise<T>((resolve, reject) => {
    tenir = resolve
    rompre = reject
  })
  promesse.catch(() => undefined)
  return { promesse, tenir, rompre }
}

const trace = (n: number): LonLat[] => [
  [4.8 + n * 1e-4, 45.75],
  [4.8 + n * 1e-4 + 1e-4, 45.75],
]

const itineraire = (id: number): Itinerary => ({
  osmRelationId: id,
  ref: null,
  name: `Itinéraire ${String(id)}`,
  network: 'GR',
  ways: [{ osmWayId: id * 10, coords: trace(id) }],
  totalMeters: 100,
  fetchedAt: '2026-08-31T00:00:00.000Z',
})

function harnais() {
  const etat: Record<string, unknown> = {
    detailItineraryId: null,
    elevationProfile: null,
    elevationLoading: false,
    elevationError: null,
    pois: [],
    poisLoading: false,
    view3D: false,
  }
  const deps = {
    set: (partiel: object) => {
      Object.assign(etat, partiel)
    },
    etatFiche: () => etat,
    itineraireParId: (id: number) => (id === 99 ? undefined : itineraire(id)),
    poisEmportes: () => Promise.resolve(null),
  } as unknown as Deps
  return { actions: trancheFiche(deps), etat }
}

beforeEach(() => {
  profil = () => Promise.resolve({ points: [] })
  poisReseau = () => Promise.resolve([])
})

describe('le profil d’une fiche abandonnée ne s’affiche pas sur la suivante', () => {
  it('quand on ouvre une autre fiche pendant le chargement', async () => {
    const premiere = differee<{ points: unknown[] }>()
    const seconde = differee<{ points: unknown[] }>()
    const file = [premiere, seconde]
    profil = () => file.shift()!.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(1)
    actions.openItineraryDetail(2)

    premiere.tenir({ points: ['le profil de la fiche 1'] })
    await premiere.promesse
    await Promise.resolve()

    expect(
      etat.elevationProfile,
      'le profil de la fiche qu’on venait de quitter s’affichait sous le nom' +
        ' de celle qu’on regardait.',
    ).toBeNull()
    expect(etat.elevationLoading).toBe(true)

    seconde.tenir({ points: ['le profil de la fiche 2'] })
    await seconde.promesse
    await Promise.resolve()
    expect(etat.elevationProfile).toEqual({
      points: ['le profil de la fiche 2'],
    })
  })

  it('quand on ferme la fiche puis on la rouvre, la même', async () => {
    /*
      La moitié droite de la garde ne suffit pas ici : l'identifiant est le
      même des deux côtés. Seul le compteur distingue la réponse d'avant de
      celle d'après — c'est le cas que `closeItineraryDetail` fait naître en
      avançant `sequence`.
    */
    const premiere = differee<{ points: unknown[] }>()
    const seconde = differee<{ points: unknown[] }>()
    const file = [premiere, seconde]
    profil = () => file.shift()!.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(7)
    actions.closeItineraryDetail()
    actions.openItineraryDetail(7)

    premiere.tenir({ points: ['la réponse d’avant'] })
    await premiere.promesse
    await Promise.resolve()

    expect(
      etat.elevationProfile,
      'la réponse de l’ouverture précédente revenait s’installer dans la' +
        ' fiche rouverte : deux requêtes, et c’est la vieille qui gagnait.',
    ).toBeNull()
  })

  it('une fiche fermée ne se rouvre pas toute seule', async () => {
    const attente = differee<{ points: unknown[] }>()
    profil = () => attente.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(3)
    actions.closeItineraryDetail()
    expect(etat.detailItineraryId).toBeNull()

    attente.tenir({ points: ['trop tard'] })
    await attente.promesse
    await Promise.resolve()

    expect(etat.elevationProfile).toBeNull()
    expect(etat.detailItineraryId).toBeNull()
  })
})

describe('la fiche fermée par ailleurs, sans passer par sa propre fermeture', () => {
  /*
    LA question qui a manqué au premier jet, et le seul cas où la moitié
    droite de la garde décide.

    Les deux moitiés de `encoreLa()` se couvrent l'une l'autre dans tout ce
    qui précède : chacune, retirée seule, laisse les autres tests verts. J'ai
    d'abord cru à deux mutants équivalents. Ils ne le sont pas.

    `trancheDemonstration.ts:170` — `quitterDemonstration` — remet
    `detailItineraryId: null` **directement**, sans appeler
    `closeItineraryDetail`, donc sans faire avancer `sequence`. C'est le seul
    écrivain de ce champ hors de cette tranche, vérifié par `grep`. Dans
    cette fenêtre, `courante === sequence` reste vrai alors que la fiche
    n'est plus là : seule la moitié droite l'arrête.

    Le scénario ci-dessous reproduit ce geste tel quel — l'écriture directe
    — plutôt que d'appeler l'autre tranche : c'est ce que le store fait, et
    c'est ce que cette garde doit encaisser.
  */
  it('ne se repeint pas quand la démonstration a fermé la fiche', async () => {
    const attente = differee<{ points: unknown[] }>()
    profil = () => attente.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(4)
    // Le geste de `quitterDemonstration` : le champ, et rien d'autre.
    etat.detailItineraryId = null

    attente.tenir({ points: ['le profil d’une fiche qui n’est plus là'] })
    await attente.promesse
    await Promise.resolve()

    expect(
      etat.elevationProfile,
      'sortir de la démonstration ferme la fiche sans toucher au compteur :' +
        ' la réponse en vol revenait la repeindre sur un écran qui était' +
        ' passé à autre chose.',
    ).toBeNull()
  })
})

describe('l’échec du profil, et à qui il s’adresse', () => {
  it('se dit avec le message du service quand il en donne un', async () => {
    profil = () => Promise.reject(new ElevationError('altitudes indisponibles'))
    const { actions, etat } = harnais()
    actions.openItineraryDetail(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(etat.elevationError).toBe('altitudes indisponibles')
    expect(etat.elevationLoading).toBe(false)
  })

  it('se replie sur un message générique pour une panne d’une autre nature', async () => {
    // Sans couverture avant ce lot : aucun test n'atteignait ce repli.
    profil = () => Promise.reject(new TypeError('autre chose'))
    const { actions, etat } = harnais()
    actions.openItineraryDetail(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(etat.elevationError).toBe('Profil altimétrique indisponible.')
    expect(etat.elevationLoading).toBe(false)
  })

  it('l’échec d’une fiche abandonnée ne salit pas la suivante', async () => {
    const premiere = differee<{ points: unknown[] }>()
    const seconde = differee<{ points: unknown[] }>()
    const file = [premiere, seconde]
    profil = () => file.shift()!.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(1)
    actions.openItineraryDetail(2)

    premiere.rompre(new ElevationError('la panne de la fiche 1'))
    await premiere.promesse.catch(() => undefined)
    await Promise.resolve()

    expect(
      etat.elevationError,
      'la panne d’une fiche qu’on avait quittée s’affichait sur celle qu’on' +
        ' regardait, qui chargeait encore.',
    ).toBeNull()
    expect(etat.elevationLoading).toBe(true)
  })
})

describe('un itinéraire sans tracé exploitable', () => {
  it('ne laisse pas les deux témoins allumés', async () => {
    // `itineraireParId(99)` rend `undefined` : aucune coordonnée, donc rien
    // à demander. Sans cette sortie, la fiche tournait indéfiniment.
    const { actions, etat } = harnais()
    actions.openItineraryDetail(99)
    await Promise.resolve()

    expect(
      etat.elevationLoading,
      'la fiche d’un itinéraire introuvable restait en chargement pour' +
        ' toujours : rien n’allait répondre.',
    ).toBe(false)
    expect(etat.poisLoading).toBe(false)
  })
})

describe('les points d’intérêt d’une fiche abandonnée', () => {
  it('n’atterrissent pas dans la suivante', async () => {
    const premiere = differee<PointOfInterest[] | null>()
    const seconde = differee<PointOfInterest[] | null>()
    const file = [premiere, seconde]
    poisReseau = () => file.shift()!.promesse

    const { actions, etat } = harnais()
    actions.openItineraryDetail(1)
    actions.openItineraryDetail(2)

    premiere.tenir([
      { id: 'w1', kind: 'water', name: 'La source de la fiche 1' },
    ] as unknown as PointOfInterest[])
    await premiere.promesse
    await Promise.resolve()
    await Promise.resolve()

    expect(
      etat.pois,
      'les points d’intérêt d’un autre itinéraire s’affichaient sur la fiche' +
        ' ouverte : une source qui n’est pas sur le chemin qu’on regarde.',
    ).toEqual([])
    expect(etat.poisLoading).toBe(true)
  })
})
