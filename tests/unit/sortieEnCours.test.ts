import { describe, it, expect } from 'vitest'
import {
  ID_TRACE_PROVISOIRE,
  chiffresDeLaSortie,
  deniveleParcouru,
  distanceParcourue,
  temoinDeSortie,
  traceProvisoire,
  versTrace,
} from '../../src/core/sortieEnCours.ts'
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
import { distanceMeters } from '../../src/core/geo.ts'

/**
 * Issue #152, pierre 3 — ce que l'écran de marche a le droit d'afficher.
 *
 * Les chiffres d'abord, l'écran ensuite : un kilométrage faux est pire
 * qu'un kilométrage absent, parce qu'on le croit. Tout ce qui se calcule
 * ici se calcule sans navigateur.
 */

const T0 = 1_700_000_000_000

/**
 * Une ligne est-ouest à 45,75° N : à cette latitude, 0,001° de longitude
 * vaut environ 77,7 m. On ne code pas ce nombre en dur — les tests
 * comparent à `distanceMeters`, qui est la référence du dépôt.
 */
function point(
  iLon: number,
  instant: number,
  altitude: number | null = 200,
): PointBrut {
  return {
    lon: 4.8 + iLon / 1000,
    lat: 45.75,
    instant,
    precisionMetres: 8,
    altitude,
  }
}

function sortieDeTroisPoints(): Enregistrement {
  let e = demarrer(enregistreurVide(), T0)
  e = ajouterPoint(e, point(0, T0 + 1_000))
  e = ajouterPoint(e, point(1, T0 + 2_000))
  e = ajouterPoint(e, point(2, T0 + 3_000))
  return e
}

describe('la distance parcourue', () => {
  it('vaut zéro tant qu’il y a moins de deux points', () => {
    expect(distanceParcourue(enregistreurVide())).toBe(0)
    const e = ajouterPoint(demarrer(enregistreurVide(), T0), point(0, T0))
    expect(distanceParcourue(e)).toBe(0)
  })

  it('additionne les segments successifs', () => {
    const e = sortieDeTroisPoints()
    const attendu =
      distanceMeters([4.8, 45.75], [4.801, 45.75]) +
      distanceMeters([4.801, 45.75], [4.802, 45.75])
    expect(distanceParcourue(e)).toBeCloseTo(attendu, 6)
  })

  /**
   * **La décision de cette pierre.** Une pause de deux heures pendant
   * laquelle on redescend en voiture chercher des lacets laisserait, entre
   * le dernier point d'avant et le premier point d'après, un segment de
   * quinze kilomètres. Personne ne les a marchés, et l'enregistrement ne
   * sait pas ce qui s'est passé : il n'écoutait pas.
   *
   * Le segment qui enjambe une pause n'est donc pas compté. C'est le même
   * raisonnement qu'à la reprise après un onglet tué — on ne compte que ce
   * qu'on a vu.
   */
  it('ne compte pas le segment qui enjambe une pause', () => {
    let e = sortieDeTroisPoints()
    const avantLaPause = distanceParcourue(e)
    e = suspendre(e, T0 + 4_000)
    e = reprendre(e, T0 + 7_200_000)
    // Repris quinze kilomètres plus loin.
    e = ajouterPoint(e, point(200, T0 + 7_201_000))
    e = ajouterPoint(e, point(201, T0 + 7_202_000))

    const dernierSegment = distanceMeters([4.999, 45.75], [5.0, 45.75])
    expect(distanceParcourue(e)).toBeCloseTo(avantLaPause + dernierSegment, 6)
  })

  /**
   * Une position peut arriver à la milliseconde exacte où l'on appuie sur
   * « Pause » : c'est même le cas ordinaire, puisque c'est souvent le point
   * reçu qui donne son instant à la transition. Les bornes de l'intervalle
   * sont donc fermées des deux côtés — sinon ce point n'appartient à aucun
   * intervalle, et le segment qui y mène disparaît du compte.
   */
  it('compte le point qui arrive à l’instant même de la pause', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(0, T0 + 1_000))
    e = ajouterPoint(e, point(1, T0 + 2_000))
    e = suspendre(e, T0 + 2_000)
    expect(distanceParcourue(e)).toBeCloseTo(
      distanceMeters([4.8, 45.75], [4.801, 45.75]),
      6,
    )
  })

  it('compte à nouveau normalement après la reprise', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(0, T0 + 1_000))
    e = suspendre(e, T0 + 2_000)
    e = reprendre(e, T0 + 3_000)
    e = ajouterPoint(e, point(1, T0 + 4_000))
    e = ajouterPoint(e, point(2, T0 + 5_000))
    e = ajouterPoint(e, point(3, T0 + 6_000))
    const attendu =
      distanceMeters([4.801, 45.75], [4.802, 45.75]) +
      distanceMeters([4.802, 45.75], [4.803, 45.75])
    expect(distanceParcourue(e)).toBeCloseTo(attendu, 6)
  })
})

describe('le dénivelé', () => {
  /**
   * L'hystérésis de 3 m est celle qu'applique déjà `elevationGainMeters` à
   * toute trace importée. On ne s'en invente pas une autre : deux formules
   * pour le même chiffre finiraient par diverger, et personne ne saurait
   * laquelle est affichée (CLAUDE.md §4).
   */
  it('filtre le bruit du GPS comme le fait l’import', () => {
    let e = demarrer(enregistreurVide(), T0)
    const altitudes = [200, 201, 200, 199, 201, 210, 209, 220]
    altitudes.forEach((altitude, i) => {
      e = ajouterPoint(e, point(i, T0 + i * 1_000, altitude))
    })
    // L'hystérésis repart du point le plus bas atteint : 199 → 210, puis
    // 209 → 220. Onze mètres deux fois, et pas les vingt qu'on lirait en
    // suivant les sommets. Les oscillations d'un mètre ne comptent pas ;
    // les creux, eux, déplacent la référence.
    expect(deniveleParcouru(e)).toBe(22)
  })

  it('rend null quand aucun point ne porte d’altitude', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(0, T0 + 1_000, null))
    e = ajouterPoint(e, point(1, T0 + 2_000, null))
    expect(deniveleParcouru(e)).toBeNull()
  })

  it('rend null sur une sortie sans le moindre point', () => {
    expect(deniveleParcouru(enregistreurVide())).toBeNull()
  })
})

describe('les chiffres de l’écran de marche', () => {
  it('rassemble distance, durées et dénivelé en un seul objet', () => {
    const e = sortieDeTroisPoints()
    const chiffres = chiffresDeLaSortie(e, T0 + 3_000)
    expect(chiffres.distanceMetres).toBeCloseTo(distanceParcourue(e), 6)
    expect(chiffres.dureeTotaleMs).toBe(3_000)
    expect(chiffres.dureeEnMarcheMs).toBe(3_000)
    expect(chiffres.deniveleMetres).toBe(0)
    expect(chiffres.points).toBe(3)
  })

  /**
   * La vitesse est un quotient, pas un seuil : elle n'a rien à inventer.
   * Mais elle se tait tant que le dénominateur est trop court pour vouloir
   * dire quelque chose — sur les premières secondes d'une sortie, le
   * moindre saut GPS donne des dizaines de kilomètres-heure.
   */
  it('ne rend pas de vitesse tant que rien n’a été marché', () => {
    const e = demarrer(enregistreurVide(), T0)
    expect(chiffresDeLaSortie(e, T0).vitesseMetresParSeconde).toBeNull()
  })

  it('rend la vitesse moyenne en marche, pauses déduites', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(0, T0))
    e = suspendre(e, T0 + 60_000)
    e = reprendre(e, T0 + 3_660_000) // une heure de pause
    e = ajouterPoint(e, point(10, T0 + 3_660_000))
    e = ajouterPoint(e, point(20, T0 + 3_720_000))

    const chiffres = chiffresDeLaSortie(e, T0 + 3_720_000)
    const distance = distanceMeters([4.81, 45.75], [4.82, 45.75])
    expect(chiffres.dureeEnMarcheMs).toBe(120_000)
    expect(chiffres.vitesseMetresParSeconde).toBeCloseTo(distance / 120, 6)
  })

  it('avance avec l’horloge tant que rien n’est terminé', () => {
    const e = sortieDeTroisPoints()
    expect(chiffresDeLaSortie(e, T0 + 10_000).dureeTotaleMs).toBe(10_000)
    expect(chiffresDeLaSortie(e, T0 + 20_000).dureeTotaleMs).toBe(20_000)
  })
})

describe('la trace produite à la fin', () => {
  it('rend null tant que la sortie n’est pas terminée', () => {
    expect(versTrace(sortieDeTroisPoints(), 'sortie-1')).toBeNull()
  })

  it('rend null pour une sortie terminée sans le moindre point', () => {
    const e = terminer(demarrer(enregistreurVide(), T0), T0 + 1_000)
    expect(versTrace(e, 'sortie-1')).toBeNull()
  })

  /**
   * `demarrer` et `terminer` posent ces deux instants, mais la structure
   * les autorise à manquer — une sauvegarde abîmée, une version future. Une
   * trace datée d'une date inventée est pire qu'une trace absente : elle
   * irait se ranger dans l'historique d'une autre année.
   */
  it('rend null si un instant manque, plutôt que d’inventer une date', () => {
    let e = sortieDeTroisPoints()
    e = terminer(e, T0 + 4_000)
    expect(versTrace({ ...e, termineA: null }, 'sortie-1')).toBeNull()
    expect(versTrace({ ...e, demarreA: null }, 'sortie-1')).toBeNull()
  })

  it('produit une trace que le reste de l’application sait lire', () => {
    let e = sortieDeTroisPoints()
    e = terminer(e, T0 + 4_000)
    const trace = versTrace(e, 'sortie-1')

    expect(trace).not.toBeNull()
    expect(trace?.id).toBe('sortie-1')
    expect(trace?.points).toEqual([
      [4.8, 45.75],
      [4.801, 45.75],
      [4.802, 45.75],
    ])
    expect(trace?.times).toEqual([T0 + 1_000, T0 + 2_000, T0 + 3_000])
    expect(trace?.elevationGain).toBe(0)
    // La date de la sortie est celle du départ, pas celle de l'écriture.
    expect(trace?.date).toBe(new Date(T0).toISOString())
  })

  /**
   * `hdops` porte la qualité par point pour les traces importées
   * (issue #149). La géolocalisation ne rend pas de HDOP mais une précision
   * en mètres : ce n'est pas la même grandeur, et la ranger là serait
   * mentir sur ce qu'on mesure.
   */
  it('ne range pas la précision en mètres dans le champ des HDOP', () => {
    let e = sortieDeTroisPoints()
    e = terminer(e, T0 + 4_000)
    const trace = versTrace(e, 'sortie-1')
    expect(trace?.hdops ?? null).toBeNull()
    expect(trace?.precisionsMetres).toEqual([8, 8, 8])
  })

  it('nomme la trace de façon reconnaissable, sans nom de fichier inventé', () => {
    let e = sortieDeTroisPoints()
    e = terminer(e, T0 + 4_000)
    expect(versTrace(e, 'sortie-1')?.filename).toBe('Sortie enregistrée')
  })
})


/**
 * La sortie qu'on est en train de marcher, dessinée sur la carte.
 *
 * Sans elle, on marche deux heures en regardant une carte vide : le produit
 * s'appelle Sentiers, et il ne montrait le sentier qu'une fois la sortie
 * rangée. La trace provisoire passe par la même source que les traces
 * importées — une seule couche, un seul style, rien à tenir en double.
 */
describe('la trace provisoire', () => {
  it('rend null tant qu’il n’y a pas de quoi tracer une ligne', () => {
    expect(traceProvisoire(enregistreurVide())).toBeNull()
    const unSeulPoint = ajouterPoint(
      demarrer(enregistreurVide(), T0),
      point(0, T0),
    )
    expect(traceProvisoire(unSeulPoint)).toBeNull()
  })

  it('dessine la sortie dès le deuxième point', () => {
    const e = sortieDeTroisPoints()
    const trace = traceProvisoire(e)
    expect(trace?.id).toBe(ID_TRACE_PROVISOIRE)
    expect(trace?.points).toEqual([
      [4.8, 45.75],
      [4.801, 45.75],
      [4.802, 45.75],
    ])
  })

  it('continue de se dessiner pendant une pause : elle a bien été marchée', () => {
    const e = suspendre(sortieDeTroisPoints(), T0 + 4_000)
    expect(traceProvisoire(e)?.points).toHaveLength(3)
  })

  /**
   * Une fois terminée, la sortie est rangée comme trace : la dessiner deux
   * fois la ferait apparaître en double sur la carte, et compter deux fois
   * si quelqu'un s'avisait un jour de la faire compter.
   */
  it('s’efface dès que la sortie est terminée', () => {
    const e = terminer(sortieDeTroisPoints(), T0 + 4_000)
    expect(traceProvisoire(e)).toBeNull()
  })

  it('ne se dessine pas sans instant de départ', () => {
    const e = sortieDeTroisPoints()
    expect(traceProvisoire({ ...e, demarreA: null })).toBeNull()
  })

  it('ne porte pas de date : elle n’est pas encore une sortie', () => {
    const trace = traceProvisoire(sortieDeTroisPoints())
    expect(trace?.date).toBeNull()
  })
})


describe('le témoin de sortie', () => {
  it('ne dit rien au repos ni après la fin', () => {
    expect(temoinDeSortie(enregistreurVide())).toBeNull()
    expect(temoinDeSortie(terminer(sortieDeTroisPoints(), T0 + 4_000))).toBeNull()
  })

  /**
   * Une sortie en pause mérite son témoin autant qu'une sortie en marche :
   * c'est même celle qu'on oublie, puisque la pause est le moment où l'on
   * range son téléphone en croyant avoir fini.
   */
  it('distingue la marche de la pause, et se tait pour aucune des deux', () => {
    expect(temoinDeSortie(sortieDeTroisPoints())).toBe('enregistrement')
    expect(temoinDeSortie(suspendre(sortieDeTroisPoints(), T0 + 4_000))).toBe(
      'pause',
    )
  })

  it('parle avant même la première position', () => {
    expect(temoinDeSortie(demarrer(enregistreurVide(), T0))).toBe(
      'enregistrement',
    )
  })
})
