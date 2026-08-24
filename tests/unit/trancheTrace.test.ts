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

/** Les promesses d'altimétrie en attente, résolues par le test. */
const altimetriesEnAttente: {
  resoudre: (p: { elevations: (number | null)[] }) => void
  rejeter: (e: unknown) => void
}[] = []

vi.mock('../../src/core/elevation.ts', async () => {
  const vrai = await vi.importActual<
    typeof import('../../src/core/elevation.ts')
  >('../../src/core/elevation.ts')
  return {
    ...vrai,
    fetchElevationProfile: () =>
      new Promise<{ elevations: (number | null)[] }>((resolve, reject) => {
        altimetriesEnAttente.push({ resoudre: resolve, rejeter: reject })
      }),
  }
})

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
function banc(balises: Itinerary[], ficheOuverte = false) {
  let etat: EtatTrace = { ...TRACE_VIDE }
  const enregistres: Itinerary[] = []
  let perso: Itinerary[] = []
  let fermetures = 0
  const actions = trancheTrace({
    set: (partiel) => {
      etat = { ...etat, ...partiel }
    },
    etatTrace: () => etat,
    itinerairesDuGraphe: () => ({ balises, perso }),
    prochainIdentifiantPerso: () => -1,
    ficheOuverte: () => ficheOuverte,
    fermerLaFiche: () => {
      fermetures += 1
    },
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
    fermetures: () => fermetures,
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

    /*
      Les valeurs sont écrites **en toutes lettres**, et non comparées à
      `TRACE_VIDE`.

      La première version disait `toEqual({ ...TRACE_VIDE, drawMode: true })`.
      Elle comparait l'état à la table qu'elle prétendait vérifier : fausser
      la table faussait les deux côtés, et le test restait vert. Trouvé par la
      vague de mutation du 24/08 — `drawPath: []` remplacé par
      `['Stryker was here']` a survécu, et deux voisins avec lui.

      C'est le §1 sous une forme qu'on ne voit pas en relisant : un test qui
      prend pour oracle la constante qu'il contrôle ne peut pas échouer sur
      elle. La redondance est ici la seule chose qui teste quelque chose.
    */
    expect(b.etat()).toEqual({
      drawMode: true,
      drawWaypointKeys: [],
      drawWaypoints: [],
      drawPath: [],
      drawError: null,
      drawGainMeters: null,
      drawGainLoading: false,
    })
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

/**
 * Ce que la vague de mutation a montré n'être couvert par aucun test unitaire.
 *
 * Cinquante-sept mutants de ce module ne rencontraient **aucun** test :
 * `allerRetourTrace`, `bouclerTrace`, `undoDrawPoint`, le dénivelé estimé, et
 * la fermeture de la fiche à l'ouverture du mode tracé. Ils étaient couverts
 * par `tests/e2e/tracer.spec.ts`, que Stryker ne voit pas — « non couvert »
 * n'y voulait donc pas dire « non testé », mais « testé par un exécutant que
 * la vague ignore ».
 *
 * Les couvrir ici a un intérêt propre, et c'est ce qui rendait l'extraction
 * de la tranche utile : ces chemins-là demandent un réseau qui ne répond pas,
 * un service muet, un point hors du graphe — trois situations qu'un test de
 * bout en bout met dix lignes à fabriquer et une seconde à jouer.
 */
describe('ouvrir le mode tracé', () => {
  beforeEach(() => {
    construits.length = 0
    altimetriesEnAttente.length = 0
  })

  it('ferme la fiche détail, qui occupe la même zone d’écran', () => {
    const b = banc([segment(1, [4.5, 45.4])], true)
    b.actions.toggleDrawMode()
    expect(b.fermetures()).toBe(1)
  })

  it('ne ferme rien quand aucune fiche n’est ouverte', () => {
    const b = banc([segment(1, [4.5, 45.4])], false)
    b.actions.toggleDrawMode()
    expect(b.fermetures()).toBe(0)
  })

  /** Refermer le mode tracé n'a aucune raison de fermer une fiche. */
  it('ne ferme pas la fiche quand on quitte le mode tracé', () => {
    const b = banc([segment(1, [4.5, 45.4])], true)
    b.actions.toggleDrawMode()
    b.actions.toggleDrawMode()
    expect(b.fermetures()).toBe(1)
  })
})

describe('compléter un tracé', () => {
  beforeEach(() => {
    construits.length = 0
    altimetriesEnAttente.length = 0
  })

  it('l’aller-retour repasse par où l’on est venu', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    const etapes = b.etat().drawWaypointKeys.length
    b.actions.allerRetourTrace()
    // n étapes deviennent 2n−1 : on revient sans repasser deux fois au bout.
    expect(b.etat().drawWaypointKeys).toHaveLength(etapes * 2 - 1)
  })

  it('un aller-retour sur une seule étape ne fait rien', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    const avant = b.etat().drawWaypointKeys
    b.actions.allerRetourTrace()
    expect(b.etat().drawWaypointKeys).toBe(avant)
  })

  it('défaire retire la dernière étape et rien d’autre', () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.502, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    expect(b.etat().drawWaypointKeys).toHaveLength(3)
    b.actions.undoDrawPoint()
    expect(b.etat().drawWaypointKeys).toHaveLength(2)
    expect(b.etat().drawWaypoints).toHaveLength(2)
    expect(b.etat().drawPath.length).toBeGreaterThan(0)
  })

  /**
   * Le dénivelé affiché décrit le tracé d'avant : le garder sous le nouveau
   * serait un chiffre juste, appliqué à autre chose.
   */
  it('modifier le tracé efface le dénivelé estimé', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    const attente = b.actions.estimerDeniveleTrace()
    altimetriesEnAttente[0]?.resoudre({ elevations: [800, 850, 900] })
    await attente
    expect(b.etat().drawGainMeters).toBeGreaterThan(0)

    b.actions.undoDrawPoint()
    expect(b.etat().drawGainMeters).toBeNull()
  })
})

describe('estimer le dénivelé', () => {
  beforeEach(() => {
    construits.length = 0
    altimetriesEnAttente.length = 0
  })

  function tracéDeDeuxPoints() {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.503, 45.4])
    return b
  }

  it('ne demande rien tant qu’il n’y a pas deux points', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    await b.actions.estimerDeniveleTrace()
    expect(altimetriesEnAttente).toHaveLength(0)
  })

  it('ne lance pas deux requêtes pour un même tracé', async () => {
    const b = tracéDeDeuxPoints()
    const premiere = b.actions.estimerDeniveleTrace()
    await b.actions.estimerDeniveleTrace()
    expect(altimetriesEnAttente).toHaveLength(1)
    altimetriesEnAttente[0]?.resoudre({ elevations: [800, 810] })
    await premiere
  })

  /**
   * Un service qui répond **sans une seule altitude** n'est pas une panne,
   * mais ce n'est pas un chiffre non plus. Le dire, plutôt que d'afficher
   * zéro — qui serait un dénivelé plausible et faux.
   */
  it('un relief indisponible se dit, au lieu d’annoncer zéro', async () => {
    const b = tracéDeDeuxPoints()
    const attente = b.actions.estimerDeniveleTrace()
    altimetriesEnAttente[0]?.resoudre({ elevations: [null, null] })
    await attente
    expect(b.etat().drawGainMeters).toBeNull()
    expect(b.etat().drawError).toMatch(/relief/i)
    expect(b.etat().drawGainLoading).toBe(false)
  })

  it('une panne du service laisse le tracé enregistrable', async () => {
    const b = tracéDeDeuxPoints()
    const attente = b.actions.estimerDeniveleTrace()
    altimetriesEnAttente[0]?.rejeter(new Error('réseau'))
    await attente
    expect(b.etat().drawGainMeters).toBeNull()
    expect(b.etat().drawError).toMatch(/enregistrable/i)
    expect(b.etat().drawGainLoading).toBe(false)
    expect(b.etat().drawPath.length).toBeGreaterThan(0)
  })
})

/**
 * Deux points suffisent : c'est le plus petit tracé qui ait un sens, et le
 * mutant qui passait `< 2` à `<= 2` le refusait sans que rien ne s'en
 * aperçoive.
 */
describe('le plus petit tracé enregistrable', () => {
  beforeEach(() => {
    construits.length = 0
    altimetriesEnAttente.length = 0
  })

  it('deux étapes suffisent à enregistrer', async () => {
    const b = banc([segment(1, [4.5, 45.4])])
    b.actions.toggleDrawMode()
    b.actions.addDrawPoint([4.5, 45.4])
    b.actions.addDrawPoint([4.501, 45.4])
    await b.actions.saveDrawnItinerary('deux points')
    expect(b.enregistres).toHaveLength(1)
  })
})
