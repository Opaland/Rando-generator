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

describe('la pause et la reprise', () => {
  it('rouvre la veille en reprenant', async () => {
    await marcher(2)
    tranche.actions.suspendreSortie()
    expect(etat.enregistrement.etat).toBe('pause')

    horloge = T0 + 60_000
    tranche.actions.poursuivreSortie()
    expect(etat.enregistrement.etat).toBe('enregistrement')
    expect(veilleurs).toContain('sortie')
    expect(etat.sortieReprise).toBe(false)
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
