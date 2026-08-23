import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { openSentiersDb, type SentiersDb } from '../../src/db/database.ts'
import { entete, pointsAEcrire } from '../../src/core/reprise.ts'
import {
  ajouterPoint,
  demarrer,
  enregistreurVide,
  terminer,
  type Enregistrement,
} from '../../src/core/recorder.ts'
import {
  chiffresDeLaSortie,
  versTrace,
} from '../../src/core/sortieEnCours.ts'

/**
 * Issue #152 — une sortie de quatre heures tient-elle ?
 *
 * La question n'est pas rhétorique : c'est la durée d'une randonnée
 * ordinaire, et c'est le moment où la batterie est la plus basse. Ce qui
 * coûte de plus en plus cher à mesure que la sortie s'allonge finit
 * toujours par coûter le plus cher au pire moment.
 *
 * **Ce que ce fichier ne mesure pas** : la batterie. Elle ne se mesure pas
 * dans un test, elle se mesure sur un téléphone, et tant qu'elle ne l'est
 * pas rien n'est promis à son sujet (`docs/PROTOCOLE_BATTERIE.md`).
 *
 * Ce qu'il mesure, lui, est ce qui pourrait rendre le reste inutile : le
 * coût d'écriture point par point, et le coût de recalcul des chiffres
 * affichés à chaque battement de seconde.
 */

/** Quatre heures à une position par seconde. */
const POINTS_QUATRE_HEURES = 4 * 3600

const T0 = 1_700_000_000_000

function sortieDe(nbPoints: number): Enregistrement {
  let e = demarrer(enregistreurVide(), T0)
  for (let i = 0; i < nbPoints; i++) {
    e = ajouterPoint(e, {
      // Un pas de 1,5 m environ, avec un relief qui monte et redescend.
      lon: 4.8 + i * 0.00002,
      lat: 45.75,
      instant: T0 + i * 1000,
      precisionMetres: 8,
      altitude: 200 + Math.sin(i / 300) * 120,
    })
  }
  return e
}

describe('une sortie de quatre heures', () => {
  it('se calcule en moins de 100 ms à chaque battement de seconde', () => {
    const e = sortieDe(POINTS_QUATRE_HEURES)
    expect(e.points).toHaveLength(POINTS_QUATRE_HEURES)

    const debut = performance.now()
    const chiffres = chiffresDeLaSortie(e, T0 + POINTS_QUATRE_HEURES * 1000)
    const duree = performance.now() - debut

    expect(chiffres.distanceMetres).toBeGreaterThan(0)
    expect(chiffres.deniveleMetres).toBeGreaterThan(0)
    // L'écran se rafraîchit une fois par seconde : un calcul plus long que
    // cela mangerait le processeur en continu, quatre heures durant.
    expect(duree).toBeLessThan(100)
  })

  it('produit sa trace en moins de 200 ms', () => {
    const e = terminer(sortieDe(POINTS_QUATRE_HEURES), T0 + 14_400_000)
    const debut = performance.now()
    const trace = versTrace(e, 'sortie-longue')
    const duree = performance.now() - debut

    expect(trace?.points).toHaveLength(POINTS_QUATRE_HEURES)
    expect(duree).toBeLessThan(200)
  })

  /**
   * Le vrai risque de la persistance : un coût qui grandit avec la sortie.
   *
   * Réécrire le tableau complet à chaque position serait quadratique — la
   * millième écriture coûtant mille fois la première, et le pire arrivant
   * à la quatrième heure, quand la batterie est au plus bas. On ajoute donc
   * les points un par un.
   *
   * **Ce test compte, il ne chronomètre pas.** Une première version
   * comparait le temps des cent dernières écritures à celui des cent
   * premières ; elle passait seule et échouait sous l'instrumentation de
   * couverture, qui multiplie les deux sans les multiplier pareil. Un
   * seuil de temps sur une machine partagée mesure la machine autant que le
   * code. Le nombre d'enregistrements réellement remis à la base, lui, ne
   * dépend de rien : sur une sortie de deux mille points, il en faut deux
   * mille. En quadratique il en faudrait deux millions.
   */
  it('n’écrit chaque point qu’une fois sur toute la sortie', async () => {
    const base: SentiersDb = await openSentiersDb('sentiers-perf-sortie')
    const e = sortieDe(2_000)

    // Le même geste que le store : un compteur en mémoire, avancé après
    // chaque écriture, et non un `count()` avant chaque point — c'est ce
    // comptage-là, et non l'ajout, qui faisait grandir le prix (mesuré :
    // rapport de 1,6 à 2,8 entre les cent dernières écritures et les cent
    // premières).
    let ecrits = 0
    let remisALaBase = 0
    for (let i = 0; i < e.points.length; i++) {
      const partielle: Enregistrement = {
        ...e,
        points: e.points.slice(0, i + 1),
      }
      const aEcrire = pointsAEcrire(partielle, ecrits)
      remisALaBase += aEcrire.length
      await base.ajouterPointsEnregistres(aEcrire)
      ecrits += aEcrire.length
      await base.ecrireEntete(entete(partielle, partielle.points[i]?.instant ?? 0))
    }

    expect(remisALaBase).toBe(2_000)
    expect(await base.compterPointsEnregistres()).toBe(2_000)
  })
})
