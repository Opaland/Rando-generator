import { describe, it, expect } from 'vitest'
import {
  VERSION_REPRISE,
  entete,
  pointsAEcrire,
  reprendreApresInterruption,
  type EnteteEnregistrement,
} from '../../src/core/reprise.ts'
import {
  ajouterPoint,
  demarrer,
  enregistreurVide,
  reprendre,
  suspendre,
  terminer,
  type Enregistrement,
  type PointBrut,
} from '../../src/core/recorder.ts'

/**
 * Issue #152, pierre 2 — survivre à un onglet tué.
 *
 * Une sortie dure quatre heures. Pendant ces quatre heures, l'écran se
 * verrouille, le navigateur récupère de la mémoire, la batterie se vide,
 * quelqu'un balaie l'application par mégarde. Ce qui n'a pas été écrit
 * n'existe pas.
 *
 * Ce module ne connaît toujours ni IndexedDB ni React : il dit **ce qu'il
 * faut écrire** et **ce qu'on retrouve**. Les deux questions qui se cassent
 * en silence sont ici — écrire deux fois le même point, et rendre à une
 * reprise un temps de marche qui inclut les trois heures pendant lesquelles
 * le téléphone était éteint.
 */

const T0 = 1_700_000_000_000

function point(lon: number, lat: number, instant: number): PointBrut {
  return { lon, lat, instant, precisionMetres: 8, altitude: 210 }
}

/** Une sortie en cours : démarrée à T0, trois points, toujours en marche. */
function enCours(): Enregistrement {
  let e = demarrer(enregistreurVide(), T0)
  e = ajouterPoint(e, point(4.8, 45.75, T0 + 1_000))
  e = ajouterPoint(e, point(4.81, 45.75, T0 + 2_000))
  e = ajouterPoint(e, point(4.82, 45.75, T0 + 3_000))
  return e
}

describe('ce qu’il reste à écrire', () => {
  it('rend les points qui n’ont pas encore été écrits', () => {
    const e = enCours()
    expect(pointsAEcrire(e, 0)).toHaveLength(3)
    expect(pointsAEcrire(e, 2)).toEqual([point(4.82, 45.75, T0 + 3_000)])
    expect(pointsAEcrire(e, 3)).toEqual([])
  })

  /**
   * Le compteur vient du disque, l'enregistrement de la mémoire : rien ne
   * garantit que le premier soit le plus petit. Un compteur en avance
   * signifierait réécrire des points en négatif, ou pire, en redemander.
   */
  it('ne rend rien quand le compteur est en avance sur la mémoire', () => {
    expect(pointsAEcrire(enCours(), 9)).toEqual([])
  })

  it('n’écrit rien deux fois le long d’une sortie', () => {
    let e = demarrer(enregistreurVide(), T0)
    let ecrits = 0
    const journal: PointBrut[] = []
    for (let i = 1; i <= 20; i++) {
      e = ajouterPoint(e, point(4.8 + i / 1000, 45.75, T0 + i * 1_000))
      const aEcrire = pointsAEcrire(e, ecrits)
      journal.push(...aEcrire)
      ecrits += aEcrire.length
    }
    expect(journal).toEqual(e.points)
  })
})

describe('l’en-tête', () => {
  it('porte l’état sans les points, et la version du format', () => {
    const e = enCours()
    const tete = entete(e, T0 + 3_500)
    expect(tete).toEqual({
      version: VERSION_REPRISE,
      etat: 'enregistrement',
      demarreA: T0,
      termineA: null,
      intervalles: [{ debut: T0, fin: null }],
      ecritA: T0 + 3_500,
    })
    expect(tete).not.toHaveProperty('points')
  })
})

describe('ce qu’on retrouve après une interruption', () => {
  /**
   * **La décision de cette pierre**, et elle n'est pas technique.
   *
   * Un onglet tué à 10 h et rouvert à 13 h ne veut pas dire qu'on a marché
   * trois heures. On ne sait pas ce qui s'est passé : la personne a peut-être
   * continué sans son téléphone, peut-être déjeuné, peut-être rangé la
   * sortie. Reprendre en marche attribuerait ces trois heures au sentier ;
   * reprendre en pause dit la vérité — le chronomètre s'est arrêté là où
   * finit ce qu'on sait — et laisse la personne décider.
   */
  it('rend une sortie en pause, jamais en marche', () => {
    const e = enCours()
    const repris = reprendreApresInterruption(entete(e, T0 + 3_000), e.points)
    expect(repris?.etat).toBe('pause')
  })

  it('ferme l’intervalle ouvert au dernier instant connu', () => {
    const e = enCours()
    const repris = reprendreApresInterruption(entete(e, T0 + 3_000), e.points)
    expect(repris?.intervalles).toEqual([{ debut: T0, fin: T0 + 3_000 }])
  })

  /**
   * Le dernier point peut être plus récent que la dernière écriture
   * d'en-tête, et l'inverse aussi : l'en-tête est réécrit à chaque
   * transition, les points à chaque position. On retient le plus récent des
   * deux — c'est le dernier moment où l'on sait que l'application vivait.
   */
  it('retient le plus récent du dernier point et de la dernière écriture', () => {
    const e = enCours()
    const teteEnRetard = reprendreApresInterruption(
      entete(e, T0 + 500),
      e.points,
    )
    expect(teteEnRetard?.intervalles.at(-1)?.fin).toBe(T0 + 3_000)

    const teteEnAvance = reprendreApresInterruption(
      entete(e, T0 + 9_000),
      e.points,
    )
    expect(teteEnAvance?.intervalles.at(-1)?.fin).toBe(T0 + 9_000)
  })

  it('ne compte pas l’interruption comme du temps de marche', () => {
    const e = enCours()
    const repris = reprendreApresInterruption(entete(e, T0 + 3_000), e.points)
    expect(repris).not.toBeNull()
    // Trois heures plus tard, on rouvre l'application.
    const troisHeuresApres = T0 + 3 * 3600 * 1000
    expect(
      repris === null ? -1 : dureeEnMarcheDe(repris, troisHeuresApres),
    ).toBe(3_000)
  })

  /**
   * Démarrer puis mourir avant la première position : la géolocalisation
   * met plusieurs secondes à rendre un premier point, et c'est exactement
   * là que l'écran se verrouille encore. Sans point, le seul instant connu
   * est celui du départ.
   */
  it('reprend une sortie tuée avant sa première position', () => {
    const e = demarrer(enregistreurVide(), T0)
    const repris = reprendreApresInterruption(entete(e, T0), [])
    expect(repris?.etat).toBe('pause')
    expect(repris?.points).toEqual([])
    expect(repris?.intervalles).toEqual([{ debut: T0, fin: T0 }])
  })

  it('rend les points dans l’ordre, tels qu’ils ont été écrits', () => {
    const e = enCours()
    const repris = reprendreApresInterruption(entete(e, T0 + 3_000), e.points)
    expect(repris?.points).toEqual(e.points)
  })

  it('reprend une sortie interrompue pendant une pause, sans la rallonger', () => {
    let e = enCours()
    e = suspendre(e, T0 + 4_000)
    const repris = reprendreApresInterruption(entete(e, T0 + 4_000), e.points)
    expect(repris?.etat).toBe('pause')
    expect(repris?.intervalles).toEqual([{ debut: T0, fin: T0 + 4_000 }])
  })

  it('garde les intervalles déjà fermés d’une sortie en plusieurs temps', () => {
    let e = enCours()
    e = suspendre(e, T0 + 4_000)
    e = reprendre(e, T0 + 10_000)
    e = ajouterPoint(e, point(4.83, 45.75, T0 + 11_000))
    const repris = reprendreApresInterruption(entete(e, T0 + 11_000), e.points)
    expect(repris?.intervalles).toEqual([
      { debut: T0, fin: T0 + 4_000 },
      { debut: T0 + 10_000, fin: T0 + 11_000 },
    ])
  })
})

describe('ce qu’on refuse de reprendre', () => {
  it('ne reprend pas une sortie terminée : elle a déjà produit sa trace', () => {
    let e = enCours()
    e = terminer(e, T0 + 4_000)
    expect(reprendreApresInterruption(entete(e, T0 + 4_000), e.points)).toBeNull()
  })

  it('ne reprend pas un enregistreur au repos', () => {
    const e = enregistreurVide()
    expect(reprendreApresInterruption(entete(e, T0), [])).toBeNull()
  })

  /**
   * CLAUDE.md §2, appliqué au stockage : ce qu'on n'a pas écrit, on ne
   * prétend pas savoir le lire. Un en-tête d'une autre version peut porter
   * des intervalles qui ne veulent plus dire la même chose ; le silence
   * vaut mieux qu'une sortie inventée.
   */
  it('ne reprend pas un en-tête d’une autre version du format', () => {
    const e = enCours()
    const tete: EnteteEnregistrement = {
      ...entete(e, T0 + 3_000),
      version: VERSION_REPRISE + 1,
    }
    expect(reprendreApresInterruption(tete, e.points)).toBeNull()
  })

  it('ne reprend pas une sortie sans le moindre instant de départ', () => {
    const e = enCours()
    const tete: EnteteEnregistrement = {
      ...entete(e, T0 + 3_000),
      demarreA: null,
    }
    expect(reprendreApresInterruption(tete, e.points)).toBeNull()
  })
})

/** Petit adaptateur : `dureeEnMarche` vit dans `recorder`, pas ici. */
function dureeEnMarcheDe(e: Enregistrement, maintenant: number): number {
  return e.intervalles.reduce(
    (somme, i) => somme + Math.max(0, (i.fin ?? maintenant) - i.debut),
    0,
  )
}
