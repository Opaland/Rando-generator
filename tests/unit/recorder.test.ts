import { describe, it, expect } from 'vitest'
import {
  abandonner,
  actionsPossibles,
  ajouterPoint,
  demarrer,
  dureeEnMarche,
  dureeTotale,
  enregistreurVide,
  reprendre,
  suspendre,
  terminer,
  type Action,
  type Enregistrement,
  type PointBrut,
} from '../../src/core/recorder.ts'

/**
 * Issue #152 — le seul problème existentiel du produit, d'après l'audit
 * externe : Sentiers ne sait pas encore accompagner une randonnée. Pour voir
 * sa progression, il faut enregistrer sa sortie dans Strava ou Garmin,
 * l'exporter, et l'importer ici. La proposition de valeur dépend d'un
 * concurrent.
 *
 * Cette première pierre est la **machine à états seule** : pas de
 * géolocalisation, pas de persistance, pas d'écran. C'est là que vivent les
 * questions qui se cassent en silence — que fait une pause pendant une
 * pause, qu'est-ce qu'une sortie finie qui n'a qu'un point, que devient le
 * temps pendant qu'on boit un café. Elles s'éprouvent sans navigateur, donc
 * elles s'éprouvent pour de bon.
 */

/** Un point brut, comme la géolocalisation en rendra plus tard. */
function point(
  lon: number,
  lat: number,
  instant: number,
  precision = 8,
): PointBrut {
  return { lon, lat, instant, precisionMetres: precision, altitude: null }
}

const T0 = 1_700_000_000_000

describe('les états et leurs transitions', () => {
  it('commence à l’arrêt, sans rien', () => {
    const vide = enregistreurVide()
    expect(vide.etat).toBe('repos')
    expect(vide.points).toEqual([])
  })

  it('enchaîne repos → enregistrement → pause → enregistrement → terminé', () => {
    let e = enregistreurVide()
    e = demarrer(e, T0)
    expect(e.etat).toBe('enregistrement')
    e = suspendre(e, T0 + 1000)
    expect(e.etat).toBe('pause')
    e = reprendre(e, T0 + 2000)
    expect(e.etat).toBe('enregistrement')
    e = terminer(e, T0 + 3000)
    expect(e.etat).toBe('termine')
  })

  it('se termine aussi depuis la pause : on s’arrête souvent assis', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = suspendre(e, T0 + 1000)
    e = terminer(e, T0 + 2000)
    expect(e.etat).toBe('termine')
  })

  /**
   * Une transition impossible ne casse rien et ne change rien.
   *
   * Un double appui sur « Pause » ne doit pas faire tomber l'application au
   * milieu d'une randonnée, et il ne doit pas non plus être compté comme une
   * seconde pause — ce qui fausserait le temps de marche sans qu'on le voie.
   * `actionsPossibles` existe pour que l'interface n'ait pas à le savoir :
   * la condition est nommée une fois et lue par les boutons (CLAUDE.md §4).
   */
  it('ignore une transition impossible, sans lever ni dériver', () => {
    const repos = enregistreurVide()
    expect(suspendre(repos, T0)).toEqual(repos)
    expect(reprendre(repos, T0)).toEqual(repos)
    expect(terminer(repos, T0)).toEqual(repos)

    const enCours = demarrer(repos, T0)
    expect(demarrer(enCours, T0 + 500)).toEqual(enCours)
    expect(reprendre(enCours, T0 + 500)).toEqual(enCours)

    const enPause = suspendre(enCours, T0 + 1000)
    expect(suspendre(enPause, T0 + 1500)).toEqual(enPause)

    const fini = terminer(enCours, T0 + 2000)
    expect(demarrer(fini, T0 + 3000)).toEqual(fini)
    expect(suspendre(fini, T0 + 3000)).toEqual(fini)
    expect(reprendre(fini, T0 + 3000)).toEqual(fini)
  })

  it('annonce exactement les actions que la machine accepte', () => {
    const repos = enregistreurVide()
    expect(actionsPossibles(repos)).toEqual(['demarrer'])

    const enCours = demarrer(repos, T0)
    expect(actionsPossibles(enCours)).toEqual([
      'suspendre',
      'terminer',
      'abandonner',
    ])

    const enPause = suspendre(enCours, T0 + 1000)
    expect(actionsPossibles(enPause)).toEqual([
      'reprendre',
      'terminer',
      'abandonner',
    ])

    const fini = terminer(enCours, T0 + 2000)
    expect(actionsPossibles(fini)).toEqual([])
  })

  /**
   * L'invariant qui compte plus que l'énumération : ce que
   * `actionsPossibles` annonce est exactement ce qui change quelque chose.
   * Une action annoncée qui ne fait rien tromperait l'interface ; une action
   * tue qui agit quand même serait un chemin non gardé.
   */
  it('n’annonce que des actions qui agissent, et les annonce toutes', () => {
    // `abandonner` ne prend pas d'instant : il n'y a rien à horodater dans
    // ce qu'on jette. Les gestes sont donc appelés à travers une lambda
    // uniforme plutôt que par une signature commune de façade.
    const gestes: Record<Action, (e: Enregistrement) => Enregistrement> = {
      demarrer: (e) => demarrer(e, T0 + 5000),
      suspendre: (e) => suspendre(e, T0 + 5000),
      reprendre: (e) => reprendre(e, T0 + 5000),
      terminer: (e) => terminer(e, T0 + 5000),
      abandonner,
    }
    let enCours = demarrer(enregistreurVide(), T0)
    enCours = ajouterPoint(enCours, point(4.5, 45.4, T0 + 100))
    const etats: Enregistrement[] = [
      enregistreurVide(),
      enCours,
      suspendre(enCours, T0 + 1000),
      terminer(enCours, T0 + 1000),
    ]
    for (const depart of etats) {
      const annoncees = actionsPossibles(depart)
      for (const [nom, geste] of Object.entries(gestes) as [
        Action,
        (e: Enregistrement) => Enregistrement,
      ][]) {
        const apres = geste(depart)
        const aChange = JSON.stringify(apres) !== JSON.stringify(depart)
        expect(
          aChange,
          `depuis « ${depart.etat} », « ${nom} » ${aChange ? 'agit' : 'n’agit pas'} alors qu’il est ${annoncees.includes(nom) ? 'annoncé' : 'tu'}`,
        ).toBe(annoncees.includes(nom))
      }
    }
  })
})

describe('les points', () => {
  it('ne retient que ceux reçus pendant l’enregistrement', () => {
    let e = enregistreurVide()
    e = ajouterPoint(e, point(4.5, 45.4, T0))
    expect(e.points).toHaveLength(0)

    e = demarrer(e, T0)
    e = ajouterPoint(e, point(4.5, 45.4, T0 + 100))
    expect(e.points).toHaveLength(1)

    // En pause, la position continue d'arriver — le téléphone ne s'éteint
    // pas — et elle ne doit pas compter. C'est tout l'objet d'une pause :
    // un café ne fait pas avancer sur le sentier.
    e = suspendre(e, T0 + 200)
    e = ajouterPoint(e, point(4.6, 45.4, T0 + 300))
    expect(e.points).toHaveLength(1)

    e = reprendre(e, T0 + 400)
    e = ajouterPoint(e, point(4.7, 45.4, T0 + 500))
    expect(e.points).toHaveLength(2)

    e = terminer(e, T0 + 600)
    e = ajouterPoint(e, point(4.8, 45.4, T0 + 700))
    expect(e.points).toHaveLength(2)
  })

  it('garde les points dans l’ordre où ils arrivent', () => {
    let e = demarrer(enregistreurVide(), T0)
    for (let i = 0; i < 5; i++) {
      e = ajouterPoint(e, point(4.5 + i * 0.001, 45.4, T0 + i * 1000))
    }
    expect(e.points.map((p) => p.instant)).toEqual([
      T0,
      T0 + 1000,
      T0 + 2000,
      T0 + 3000,
      T0 + 4000,
    ])
  })

  /**
   * Un point qui ne tombe pas sur Terre est refusé, comme à l'import
   * (issue #183). La géolocalisation d'un navigateur peut rendre n'importe
   * quoi — un émulateur, une extension, un capteur qui redémarre.
   */
  it('refuse un point hors de la Terre', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(200, 45.4, T0 + 100))
    e = ajouterPoint(e, point(4.5, 91, T0 + 200))
    e = ajouterPoint(e, point(Number.NaN, 45.4, T0 + 300))
    expect(e.points).toHaveLength(0)

    e = ajouterPoint(e, point(4.5, 45.4, T0 + 400))
    expect(e.points).toHaveLength(1)
  })
})

describe('le temps', () => {
  it('sépare le temps total du temps en marche', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = suspendre(e, T0 + 10 * 60_000) // dix minutes de marche
    e = reprendre(e, T0 + 40 * 60_000) // trente minutes de pause
    e = terminer(e, T0 + 50 * 60_000) // dix minutes de marche

    expect(dureeTotale(e)).toBe(50 * 60_000)
    expect(dureeEnMarche(e)).toBe(20 * 60_000)
  })

  it('compte le temps qui court, tant que rien n’est terminé', () => {
    const e = demarrer(enregistreurVide(), T0)
    expect(dureeTotale(e, T0 + 5000)).toBe(5000)
    expect(dureeEnMarche(e, T0 + 5000)).toBe(5000)
  })

  it('gèle le temps de marche pendant la pause, pas le temps total', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = suspendre(e, T0 + 1000)
    expect(dureeTotale(e, T0 + 9000)).toBe(9000)
    expect(dureeEnMarche(e, T0 + 9000)).toBe(1000)
  })

  /**
   * Demander la durée d'un enregistrement en cours sans dire quand on est
   * rend zéro, pas un nombre inventé. C'est le cas d'un rendu qui arrive
   * avant le premier battement d'horloge : mieux vaut « pas encore de
   * temps » qu'une valeur tirée de l'instant de démarrage.
   */
  it('rend zéro quand on ne dit pas quand on est', () => {
    let e = demarrer(enregistreurVide(), T0)
    expect(dureeTotale(e)).toBe(0)
    expect(dureeEnMarche(e)).toBe(0)
    e = suspendre(e, T0 + 4000)
    // Une fois l'intervalle fermé, il porte sa propre fin : plus besoin
    // d'horloge pour le compter.
    expect(dureeEnMarche(e)).toBe(4000)
    expect(dureeTotale(e)).toBe(0)
  })

  it('ne compte rien avant d’avoir démarré', () => {
    const vide = enregistreurVide()
    expect(dureeTotale(vide, T0)).toBe(0)
    expect(dureeEnMarche(vide, T0)).toBe(0)
  })

  /**
   * L'invariant : le temps en marche ne dépasse jamais le temps total, et
   * ni l'un ni l'autre ne recule. Une soustraction inversée dans le compte
   * des pauses ne se verrait pas autrement — c'est exactement le genre de
   * défaut que la vague de mutation a trouvé dans le calcul de pente.
   */
  it('garde marche ≤ total, et aucun des deux ne recule', () => {
    let e = demarrer(enregistreurVide(), T0)
    const instants = [1000, 2000, 5000, 5000, 9000, 20_000, 21_000]
    const gestes = [suspendre, reprendre, suspendre, reprendre, suspendre, reprendre]
    let precedentTotal = 0
    let precedenteMarche = 0
    instants.forEach((delta, i) => {
      const geste = gestes[i % gestes.length]
      if (geste) e = geste(e, T0 + delta)
      const total = dureeTotale(e, T0 + delta)
      const marche = dureeEnMarche(e, T0 + delta)
      expect(marche).toBeLessThanOrEqual(total)
      expect(total).toBeGreaterThanOrEqual(precedentTotal)
      expect(marche).toBeGreaterThanOrEqual(precedenteMarche)
      precedentTotal = total
      precedenteMarche = marche
    })
  })
})

describe('abandonner', () => {
  /**
   * Le geste que l'issue ne nomme pas et dont on ne peut pas se passer :
   * démarrer par accident arrive, et on ne veut pas d'une sortie fantôme
   * dans son historique. `terminer` produit une trace ; `abandonner` n'en
   * produit aucune et remet tout à zéro.
   */
  it('ne laisse rien derrière lui', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(4.5, 45.4, T0 + 100))
    e = ajouterPoint(e, point(4.6, 45.4, T0 + 200))
    expect(abandonner(e)).toEqual(enregistreurVide())
  })

  it('s’abandonne aussi depuis la pause', () => {
    let e = demarrer(enregistreurVide(), T0)
    e = suspendre(e, T0 + 1000)
    expect(abandonner(e)).toEqual(enregistreurVide())
  })
})
