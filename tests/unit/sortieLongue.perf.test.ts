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
   * Réécrire le tableau complet à chaque position aurait été quadratique —
   * la millième écriture coûtant mille fois la première. On ajoute donc les
   * points un par un, et ce test vérifie que **la fin coûte comme le
   * début**, ce qu'aucune relecture de code ne prouve.
   */
  it('écrit le dernier point au même prix que le premier', async () => {
    const base: SentiersDb = await openSentiersDb('sentiers-perf-sortie')
    const e = sortieDe(2_000)

    // Le même geste que le store : un compteur en mémoire, avancé après
    // chaque écriture réussie, et non un `count()` avant chaque point. La
    // première version comptait à chaque tour, et c'est ce comptage — pas
    // l'ajout — qui faisait grandir le prix : mesuré, 23 ms pour les cent
    // premières écritures contre 95 ms pour les cent dernières.
    let ecrits = await base.compterPointsEnregistres()
    const chrono = async (depuis: number, jusqua: number): Promise<number> => {
      const debut = performance.now()
      for (let i = depuis; i < jusqua; i++) {
        const partielle: Enregistrement = { ...e, points: e.points.slice(0, i + 1) }
        const aEcrire = pointsAEcrire(partielle, ecrits)
        await base.ajouterPointsEnregistres(aEcrire)
        ecrits += aEcrire.length
        await base.ecrireEntete(entete(partielle, partielle.points[i]?.instant ?? 0))
      }
      return performance.now() - debut
    }

    const cent_premiers = await chrono(0, 100)
    await chrono(100, 1_900)
    const cent_derniers = await chrono(1_900, 2_000)

    expect(await base.compterPointsEnregistres()).toBe(2_000)
    // Ce que ce seuil garde, et ce qu'il ne garde pas.
    //
    // Il attrape le **quadratique** — réécrire tout le tableau à chaque
    // position : vérifié par mutation, le test devient rouge et met cinq
    // secondes au lieu de deux dixièmes.
    //
    // Il n'attrape pas les écarts plus fins. Relire `count()` avant chaque
    // point fait passer le rapport de 1,6 à 2,8 — mesuré, et corrigé dans
    // le store par un compteur en mémoire — mais ces deux nombres sont trop
    // proches pour qu'une machine d'intégration partagée les sépare. Poser
    // un seuil entre eux serait inventer une précision qu'on n'a pas.
    expect(cent_derniers).toBeLessThan(cent_premiers * 2 + 40)
  })
})
