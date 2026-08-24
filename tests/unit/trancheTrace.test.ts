import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary, LonLat } from '../../src/core/types.ts'

/**
 * La tranche « tracé » du store (issue #155).
 *
 * Ces tests ne refont pas ce que `tests/e2e/tracer.spec.ts` fait déjà : poser
 * des points, boucler, enregistrer. Ils gardent ce qu'un test de comportement
 * **ne peut pas voir** — et le découpage en a produit un exemple sur-le-champ.
 *
 * La première version de la tranche recevait la liste des itinéraires déjà
 * fusionnée. Elle en fabriquait donc un tableau neuf à chaque appel, et le
 * mémo du graphe de routage — comparé par identité — ne pouvait plus jamais
 * toucher : le graphe se reconstruisait à chaque clic, des dizaines de
 * milliers de sommets sur une grosse zone.
 *
 * La suite entière restait verte. Le tracé marchait. Seul le compteur le dit.
 */

const construits: number[] = []

vi.mock('../../src/core/routing.ts', async () => {
  const vrai = await vi.importActual<
    typeof import('../../src/core/routing.ts')
  >('../../src/core/routing.ts')
  return {
    ...vrai,
    buildRoutingGraph: (itineraires: Itinerary[]) => {
      construits.push(itineraires.length)
      return vrai.buildRoutingGraph(itineraires)
    },
  }
})

const { trancheTrace, TRACE_VIDE } =
  await import('../../src/store/trancheTrace.ts')
type EtatTrace = import('../../src/store/trancheTrace.ts').EtatTrace

/** Un itinéraire droit, dont les points serviront de cibles de clic. */
function segment(id: number, depart: LonLat): Itinerary {
  const coords: LonLat[] = Array.from({ length: 5 }, (_, i) => [
    depart[0] + i * 0.001,
    depart[1],
  ])
  return {
    osmRelationId: id,
    ref: null,
    name: `essai ${String(id)}`,
    network: 'GR',
    ways: [{ osmWayId: id, coords }],
    totalMeters: 400,
    fetchedAt: '2026-08-24T00:00:00.000Z',
  }
}

/** Un banc minimal : l'état du tracé, et rien d'autre du store. */
function banc(balises: Itinerary[]) {
  let etat: EtatTrace = { ...TRACE_VIDE }
  const enregistres: Itinerary[] = []
  let perso: Itinerary[] = []
  const actions = trancheTrace({
    set: (partiel) => {
      etat = { ...etat, ...partiel }
    },
    etatTrace: () => etat,
    itinerairesDuGraphe: () => ({ balises, perso }),
    prochainIdentifiantPerso: () => -1,
    ficheOuverte: () => false,
    fermerLaFiche: () => undefined,
    enregistrerLeTrace: (itineraire) => {
      enregistres.push(itineraire)
      perso = [...perso, itineraire]
      etat = { ...TRACE_VIDE }
      return Promise.resolve()
    },
  })
  return {
    actions,
    etat: () => etat,
    enregistres,
    changerLesPerso: (suivants: Itinerary[]) => {
      perso = suivants
    },
  }
}

describe('le graphe de routage n’est construit qu’à bon escient', () => {
  beforeEach(() => {
    construits.length = 0
  })

  it('ne le reconstruit pas entre deux points posés', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    expect(b.etat().drawWaypointKeys).toHaveLength(2)
    expect(
      construits.length,
      'le mémo du graphe ne touche plus : il est reconstruit à chaque clic',
    ).toBe(1)
  })

  /**
   * L'autre moitié : un mémo qui ne se rafraîchit jamais serait pire qu'un
   * mémo absent — on tracerait sur des chemins qui ne sont plus affichés.
   */
  it('le reconstruit quand les itinéraires changent', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    expect(construits).toHaveLength(1)
    b.changerLesPerso([segment(-1, [4.6, 45.5])])
    b.actions.addDrawPoint([4.501, 45.4])
    expect(construits).toHaveLength(2)
  })
})

describe('la remise à zéro du tracé', () => {
  beforeEach(() => {
    construits.length = 0
  })

  /**
   * `TRACE_VIDE` existe parce que trois endroits remettaient les sept champs
   * à la main. Il a suffi d'en oublier un pour qu'un dénivelé d'un tracé
   * précédent reste affiché sous le suivant.
   */
  it('ouvrir le mode tracé ne laisse rien du tracé précédent', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    expect(b.etat().drawPath.length).toBeGreaterThan(0)

    b.actions.toggleDrawMode() // on ferme
    b.actions.toggleDrawMode() // on rouvre
    expect(b.etat()).toEqual({ ...TRACE_VIDE, drawMode: true })
  })

  it('un point hors réseau le dit, sans toucher au tracé', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    const avant = b.etat().drawPath
    b.actions.addDrawPoint([12, 12])
    expect(b.etat().drawError).toMatch(/proximité/)
    expect(b.etat().drawPath).toBe(avant)
  })
})

describe('enregistrer un tracé', () => {
  it('ne rend rien tant qu’il n’y a pas deux points', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    await b.actions.saveDrawnItinerary('essai')
    expect(b.enregistres).toHaveLength(0)
  })

  it('rend un itinéraire perso nommé, mesuré, et daté', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    await b.actions.saveDrawnItinerary('  Mon tour  ')
    expect(b.enregistres).toHaveLength(1)
    const itineraire = b.enregistres[0] as Itinerary
    expect(itineraire.name).toBe('Mon tour')
    expect(itineraire.network).toBe('PERSO')
    expect(itineraire.osmRelationId).toBeLessThan(0)
    expect(itineraire.totalMeters).toBeGreaterThan(0)
  })

  /** Un nom vide ne doit pas produire un itinéraire sans nom dans la liste. */
  it('donne un nom par défaut plutôt qu’une ligne vide', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    await b.actions.saveDrawnItinerary('   ')
    expect((b.enregistres[0] as Itinerary).name).toBe('Itinéraire tracé')
  })
})
