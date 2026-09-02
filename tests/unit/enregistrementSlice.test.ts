import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  creerTrancheSortie,
  etatSortieInitial,
  type EtatSortie,
  type PortsSortie,
  type TrancheSortie,
} from '../../src/store/enregistrementSlice.ts'
import { openSentiersDb, type SentiersDb } from '../../src/db/database.ts'
import type { Track } from '../../src/core/types.ts'
import type { Veilleur } from '../../src/store/veilleGeo.ts'

/**
 * Issue #152, l'enregistrement vu de l'application.
 *
 * Tout ce que ce fichier vérifie était jusqu'ici gardé par des tests e2e —
 * c'est-à-dire par le plus lent et le plus fragile des moyens, et seulement
 * dans les états qu'un parcours de navigateur sait atteindre. La file
 * d'écriture, le compteur de points déjà écrits, la reprise après un onglet
 * tué et le passage en pause sur erreur GPS se sont chacun cassés au moins
 * une fois cette nuit ; ils s'éprouvent tous sans navigateur.
 */

const T0 = 1_700_000_000_000

let horloge = T0
let etat: EtatSortie
let base: SentiersDb
let rangees: Track[]
let demonstrationQuittee: number
let veilleurs: Veilleur[]
let veilleDisponible: boolean
/**
 * Les **demandes** de veille, dans l'ordre — distinctes des veilleurs
 * ouverts (issue #462).
 *
 * `veilleurs` dit qui tient un suivi ; il ne dit pas qui vient de le
 * demander. La nuance a rendu un test creux : « rouvre la veille en
 * reprenant » assertait `toContain('sortie')` alors que le veilleur y était
 * encore faute d'avoir jamais été retiré — la pause ne relâche pas le suivi.
 * Le test passait la ligne de reprise supprimée.
 *
 * Un compteur d'appels répond à la question posée, et y répond quelle que
 * soit la décision qui sera prise sur la pause.
 */
let demandesDeVeille: string[]
/**
 * Combien de fois l'état a été reposé — c'est-à-dire combien de fois React
 * repeindrait. Sert à mesurer ce qu'une position qui n'apporte rien coûte
 * (issue #469).
 */
let posesEtat: number
let compteur = 0

function position(i: number, altitude: number | null = 200) {
  return {
    coords: {
      longitude: 4.8 + i / 1000,
      latitude: 45.75,
      accuracy: 8,
      altitude,
    },
    timestamp: T0 + i * 1000,
  } as GeolocationPosition
}

function ports(): PortsSortie {
  return {
    lire: () => etat,
    poser: (partiel) => {
      posesEtat += 1
      etat = { ...etat, ...partiel }
    },
    base: () => base,
    rangerTrace: (trace) => {
      rangees.push(trace)
      return Promise.resolve()
    },
    quitterDemonstration: () => {
      demonstrationQuittee += 1
    },
    veille: {
      demarrer: (qui) => {
        demandesDeVeille.push(qui)
        if (!veilleDisponible) return false
        veilleurs.push(qui)
        return true
      },
      arreter: (qui) => {
        veilleurs = veilleurs.filter((v) => v !== qui)
      },
    },
    maintenant: () => horloge,
  }
}

let tranche: TrancheSortie

beforeEach(async () => {
  compteur += 1
  horloge = T0
  etat = etatSortieInitial()
  rangees = []
  demonstrationQuittee = 0
  veilleurs = []
  demandesDeVeille = []
  posesEtat = 0
  veilleDisponible = true
  base = await openSentiersDb(`sentiers-tranche-${String(compteur)}`)
  tranche = creerTrancheSortie(ports())
})

/** Démarre et marche `n` pas, écritures terminées. */
async function marcher(n: number): Promise<void> {
  tranche.actions.demarrerSortie()
  for (let i = 1; i <= n; i++) {
    horloge = T0 + i * 1000
    tranche.surPosition(position(i))
  }
  await tranche.ecrituresTerminees()
}

describe('démarrer', () => {
  it('ouvre la veille, quitte la démonstration, et part de zéro', async () => {
    tranche.actions.demarrerSortie()
    expect(etat.enregistrement.etat).toBe('enregistrement')
    expect(veilleurs).toEqual(['sortie'])
    expect(demonstrationQuittee).toBe(1)
    await tranche.ecrituresTerminees()
    expect(await base.lireEntete()).toBeDefined()
    expect(await base.compterPointsEnregistres()).toBe(0)
  })

  it('ne redémarre pas une sortie déjà commencée', () => {
    tranche.actions.demarrerSortie()
    const debut = etat.enregistrement.demarreA
    horloge = T0 + 60_000
    tranche.actions.demarrerSortie()
    expect(etat.enregistrement.demarreA).toBe(debut)
    expect(demonstrationQuittee).toBe(1)
  })

  it('refuse et le dit quand le navigateur n’a pas de géolocalisation', () => {
    veilleDisponible = false
    tranche.actions.demarrerSortie()
    expect(etat.enregistrement.etat).toBe('repos')
    expect(etat.sortieErreur).toMatch(/localisation/i)
  })

  /**
   * Le défaut le plus coûteux de la nuit du 23/08 : l'effacement de
   * l'ancien tampon courait en parallèle des premières positions, et
   * l'effacement gagnait la course. Une sortie démarrée puis rechargée
   * revenait vide — quatre points écrits, zéro relu.
   */
  it('n’efface pas le tampon par-dessus les premières positions', async () => {
    await base.ajouterPointsEnregistres([
      { lon: 1, lat: 1, instant: 1, precisionMetres: 1, altitude: null },
    ])
    await marcher(4)
    expect(await base.compterPointsEnregistres()).toBe(4)
    const lus = await base.lirePointsEnregistres()
    expect(lus.map((p) => p.lon)).toEqual(etat.enregistrement.points.map((p) => p.lon))
  })
})

describe('les points', () => {
  it('retient ce qui arrive en marche, et l’écrit une seule fois', async () => {
    await marcher(6)
    expect(etat.enregistrement.points).toHaveLength(6)
    expect(await base.compterPointsEnregistres()).toBe(6)
  })

  it('ignore une position reçue en pause', async () => {
    await marcher(3)
    horloge = T0 + 10_000
    tranche.actions.suspendreSortie()
    tranche.surPosition(position(50))
    await tranche.ecrituresTerminees()
    expect(etat.enregistrement.points).toHaveLength(3)
    expect(await base.compterPointsEnregistres()).toBe(3)
  })

  it('ignore une position reçue avant tout démarrage', async () => {
    tranche.surPosition(position(1))
    await tranche.ecrituresTerminees()
    expect(etat.enregistrement.points).toHaveLength(0)
  })

  it('refuse un point hors de la Terre, sans rien écrire', async () => {
    tranche.actions.demarrerSortie()
    tranche.surPosition({
      coords: { longitude: 999, latitude: 45, accuracy: 8, altitude: null },
      timestamp: T0,
    } as GeolocationPosition)
    await tranche.ecrituresTerminees()
    expect(etat.enregistrement.points).toHaveLength(0)
    expect(await base.compterPointsEnregistres()).toBe(0)
  })
})

describe('l’erreur de géolocalisation', () => {
  /**
   * Ce qui a été marché a été écrit : on ne jette rien. La sortie passe en
   * pause, comme après un onglet tué, et attend.
   */
  it('met la sortie en pause sans perdre ce qui est déjà là', async () => {
    await marcher(3)
    horloge = T0 + 20_000
    tranche.surErreurGeo({ code: 2, message: '' } as GeolocationPositionError)
    await tranche.ecrituresTerminees()

    expect(etat.enregistrement.etat).toBe('pause')
    expect(etat.enregistrement.points).toHaveLength(3)
    expect(etat.sortieErreur).toMatch(/signal|position/i)
    expect(await base.compterPointsEnregistres()).toBe(3)
  })

  it('ne touche à rien quand aucune sortie ne tourne', async () => {
    tranche.surErreurGeo({ code: 1, message: '' } as GeolocationPositionError)
    await tranche.ecrituresTerminees()
    expect(etat.enregistrement.etat).toBe('repos')
    expect(etat.sortieErreur).toBeNull()
  })
})

describe('terminer', () => {
  it('range la trace, ferme la veille et vide le tampon', async () => {
    await marcher(4)
    horloge = T0 + 30_000
    await tranche.actions.terminerSortie()

    expect(rangees).toHaveLength(1)
    expect(rangees[0]?.points).toHaveLength(4)
    expect(rangees[0]?.filename).toBe('Sortie enregistrée')
    expect(veilleurs).toEqual([])
    expect(etat.enregistrement.etat).toBe('repos')
    expect(await base.lireEntete()).toBeUndefined()
    expect(await base.compterPointsEnregistres()).toBe(0)
  })

  it('ne range rien quand aucune position n’est arrivée', async () => {
    tranche.actions.demarrerSortie()
    horloge = T0 + 5_000
    await tranche.actions.terminerSortie()
    expect(rangees).toEqual([])
    expect(await base.lireEntete()).toBeUndefined()
  })

  it('se termine aussi depuis la pause : on s’arrête souvent assis', async () => {
    await marcher(2)
    tranche.actions.suspendreSortie()
    await tranche.actions.terminerSortie()
    expect(rangees).toHaveLength(1)
  })
})

describe('abandonner', () => {
  it('ne laisse ni trace ni tampon', async () => {
    await marcher(5)
    await tranche.actions.abandonnerSortie()
    expect(rangees).toEqual([])
    expect(etat.enregistrement.etat).toBe('repos')
    expect(veilleurs).toEqual([])
    expect(await base.compterPointsEnregistres()).toBe(0)
    expect(await base.lireEntete()).toBeUndefined()
  })
})

describe('une position qui n’apporte rien', () => {
  it('ne repose pas l’état et n’écrit pas, pendant une pause', async () => {
    /*
      `ajouterPoint` rend l'enregistrement **inchangé** quand il n'y a rien
      à ajouter — en pause, ou pour un point hors du monde
      (`core/recorder.ts:194`). La garde `suivant === enCours` s'arrête là.

      Ce n'est pas théorique : le suivi de position **reste ouvert pendant
      la pause** (mesuré en #462). Sylvie s'arrête déjeuner, les positions
      continuent d'arriver, et sans cette garde chacune reposerait l'état —
      donc un repeint — et mettrait une écriture en file, pour rien.

      La question porte donc sur le **nombre de poses**, pas sur les points :
      ceux-ci ne bougent pas de toute façon, et une assertion sur eux
      passerait avec ou sans la garde (§1bis).
    */
    await marcher(2)
    tranche.actions.suspendreSortie()
    await tranche.ecrituresTerminees()

    const posesAvant = posesEtat
    const enBaseAvant = await base.compterPointsEnregistres()

    for (let i = 3; i <= 6; i++) {
      horloge = T0 + i * 1000
      tranche.surPosition(position(i))
    }
    await tranche.ecrituresTerminees()

    expect(posesEtat).toBe(posesAvant)
    expect(await base.compterPointsEnregistres()).toBe(enBaseAvant)
  })
})

describe('une écriture qui rate', () => {
  /*
    Ce que promet le commentaire de `pointsEcrits`, et que rien ne
    vérifiait : « le prochain point relira le compte et réécrira ce qui
    manque ».

    C'est le §4bis — une justification qui affirme. Mesurée en muant `??=`
    en `&&=` : le compteur reste à `null`, `pointsAEcrire(e, null)` fait un
    `slice(null)` qui rend **tous** les points, et la sortie entière se
    réécrit par-dessus elle-même. Cinq pas marchés, huit points en base.

    Pour Sylvie, un hoquet de quota au milieu d'une randonnée rendrait une
    trace qui repasse sur elle-même, avec une distance fausse.
  */
  it('ne réécrit que ce qui manque, sans doubler ce qui est déjà là', async () => {
    let rate = false
    const vraie = base
    base = {
      ...vraie,
      ajouterPointsEnregistres: (points) => {
        if (!rate) return vraie.ajouterPointsEnregistres(points)
        rate = false
        return Promise.reject(new Error('quota dépassé (test)'))
      },
    }
    tranche = creerTrancheSortie(ports())

    await marcher(3)
    expect(await vraie.compterPointsEnregistres()).toBe(3)

    // Le quatrième point échoue à s'écrire ; le cinquième doit rattraper.
    rate = true
    horloge = T0 + 4000
    tranche.surPosition(position(4))
    horloge = T0 + 5000
    tranche.surPosition(position(5))
    await tranche.ecrituresTerminees()

    expect(etat.enregistrement.points).toHaveLength(5)
    expect(await vraie.compterPointsEnregistres()).toBe(5)
  })
})

describe('la pause et la reprise', () => {
  it('redemande la veille en reprenant', async () => {
    /*
      Ce test s'appelait « rouvre la veille en reprenant » et ne gardait
      rien : son `toContain('sortie')` passait parce que le veilleur n'avait
      jamais été retiré — `suspendreSortie` ne relâche pas le suivi (#462).
      Vérifié en supprimant la ligne de reprise : 22 tests verts.

      La question se pose donc sur les **demandes**, pas sur l'appartenance.
      Formulée ainsi, elle reste juste le jour où la pause relâchera le
      suivi, si c'est ce qui est décidé.
    */
    await marcher(2)
    tranche.actions.suspendreSortie()
    expect(etat.enregistrement.etat).toBe('pause')
    const avant = demandesDeVeille.length

    horloge = T0 + 60_000
    tranche.actions.poursuivreSortie()

    expect(etat.enregistrement.etat).toBe('enregistrement')
    expect(demandesDeVeille.slice(avant)).toEqual(['sortie'])
    expect(etat.sortieReprise).toBe(false)
  })

  it('garde le suivi ouvert pendant la pause, faute d’avoir tranché', () => {
    /*
      Ce que le code fait aujourd'hui, écrit pour qu'on le voie plutôt que
      pour l'approuver. La sonde de #462 a mesuré que `suspendreSortie` ne
      relâche pas le suivi : une pause d'une heure au sommet garde un
      `watchPosition` haute précision ouvert à ne rien enregistrer.

      L'arbitrage demande deux nombres que personne n'a — le coût d'une heure
      de suivi, et le temps qu'une reprise met à retrouver une position
      correcte. C'est la mesure de batterie de #152, bloquée sur Cédric. Le
      §2 interdit de l'inventer.

      Ce test **n'approuve pas** ce comportement : il le rend visible, et il
      rougira le jour où quelqu'un le changera — ce qui est précisément le
      moment où il faudra relire cette décision.
    */
    tranche.actions.demarrerSortie()
    tranche.actions.suspendreSortie()

    expect(veilleurs).toEqual(['sortie'])
  })

  it('ne rouvre pas la veille si la reprise n’a pas eu lieu', () => {
    tranche.actions.poursuivreSortie()
    expect(veilleurs).toEqual([])
  })
})

describe('la reprise au démarrage', () => {
  it('retrouve une sortie interrompue, en pause, avec ses points', async () => {
    await marcher(5)

    // Une nouvelle tranche, comme après un rechargement : la mémoire est
    // partie, le disque est resté.
    etat = etatSortieInitial()
    const apres = creerTrancheSortie(ports())
    await apres.reprendreAuDemarrage(base)

    expect(etat.enregistrement.etat).toBe('pause')
    expect(etat.enregistrement.points).toHaveLength(5)
    expect(etat.sortieReprise).toBe(true)
  })

  /**
   * Après une reprise, le compteur de points déjà écrits doit valoir ce que
   * le disque contient. S'il repartait de zéro, le premier point suivant
   * réécrirait toute la sortie — et l'historique compterait deux fois ce
   * qu'on a marché.
   */
  it('ne réécrit pas ce que le disque contient déjà', async () => {
    await marcher(5)
    etat = etatSortieInitial()
    const apres = creerTrancheSortie(ports())
    await apres.reprendreAuDemarrage(base)

    apres.actions.poursuivreSortie()
    horloge = T0 + 90_000
    apres.surPosition(position(6))
    await apres.ecrituresTerminees()

    expect(await base.compterPointsEnregistres()).toBe(6)
  })

  it('ne s’impose pas à une sortie déjà démarrée pendant l’ouverture', async () => {
    await marcher(5)
    etat = etatSortieInitial()
    const apres = creerTrancheSortie(ports())
    apres.actions.demarrerSortie()
    await apres.reprendreAuDemarrage(base)

    expect(etat.sortieReprise).toBe(false)
    expect(etat.enregistrement.points).toHaveLength(0)
  })

  it('ne trouve rien à reprendre sur une base neuve', async () => {
    await tranche.reprendreAuDemarrage(base)
    expect(etat.enregistrement.etat).toBe('repos')
    expect(etat.sortieReprise).toBe(false)
  })

  it('n’empêche pas l’application d’ouvrir quand le tampon est illisible', async () => {
    const cassee = {
      ...base,
      lireEntete: () => Promise.reject(new Error('base fermée')),
    } as unknown as SentiersDb
    await expect(tranche.reprendreAuDemarrage(cassee)).resolves.toBeUndefined()
    expect(etat.enregistrement.etat).toBe('repos')
  })
})

describe('sans stockage local', () => {
  it('laisse la sortie se dérouler en mémoire', async () => {
    base = null as unknown as SentiersDb
    const sansBase = creerTrancheSortie({ ...ports(), base: () => null })
    sansBase.actions.demarrerSortie()
    sansBase.surPosition(position(1))
    sansBase.surPosition(position(2))
    await sansBase.ecrituresTerminees()
    expect(etat.enregistrement.points).toHaveLength(2)
    await sansBase.actions.terminerSortie()
    expect(rangees).toHaveLength(1)
  })
})
