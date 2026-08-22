import { describe, it, expect } from 'vitest'
import {
  dispositionDemandee,
  ONGLETS,
  positionPourOnglet,
  sectionsDeLOnglet,
} from '../../src/core/maquetteOnglets.ts'

/**
 * Issue #171 — dix sections empilées sur un seul axe, et #177 qui interdit
 * de l'industrialiser avant la session E2.
 *
 * Ce module n'existe donc pas pour livrer la refonte, mais pour la rendre
 * *essayable* : sans prototype, la session ne peut pas être conduite, et
 * l'issue attendrait indéfiniment un test qui attend l'issue.
 *
 * Le drapeau porte tout le poids de la retenue : par défaut, l'application
 * ne bouge pas d'un pixel.
 */
describe('dispositionDemandee', () => {
  it('rend les onglets par défaut', () => {
    expect(dispositionDemandee('')).toBe('onglets')
    expect(dispositionDemandee('?zone=pilat')).toBe('onglets')
  })

  it('rend les accordéons sur demande explicite', () => {
    // La porte de sortie n'est pas une politesse : c'est elle qui permet de
    // conduire la session E2 en donnant deux URL différentes à deux groupes.
    expect(dispositionDemandee('?maquette=accordeons')).toBe('accordeons')
    expect(dispositionDemandee('?zone=pilat&maquette=accordeons')).toBe('accordeons')
  })

  it('ne devine pas une valeur voisine', () => {
    // Une valeur approchante rend les onglets, jamais un troisième
    // comportement : pendant une session, une disposition inattendue
    // fausserait le relevé sans que personne s'en aperçoive.
    expect(dispositionDemandee('?maquette=accordeon')).toBe('onglets')
    expect(dispositionDemandee('?maquette=')).toBe('onglets')
    expect(dispositionDemandee('?maquette=onglets')).toBe('onglets')
  })
})

describe('les quatre onglets', () => {
  it('répondent chacun à une intention, pas à un sujet technique', () => {
    expect(ONGLETS.map((o) => o.cle)).toEqual([
      'carte',
      'sorties',
      'progression',
      'reglages',
    ])
  })

  it('portent un libellé en plus de leur icône', () => {
    // « icône **et** libellé », dit l'issue. Une icône seule se devine, et
    // se devine mal.
    for (const onglet of ONGLETS) {
      expect(onglet.libelle.length).toBeGreaterThan(2)
      expect(onglet.icone.length).toBeGreaterThan(0)
    }
  })
})

describe('sectionsDeLOnglet', () => {
  const toutes = [
    'zone',
    'traces',
    'itinerairesPerso',
    'tableauDeBord',
    'objectifs',
    'prochaineSortie',
    'historique',
    'listeItineraires',
    'reglages',
    'sauvegarde',
  ] as const

  it('place chaque section dans exactement un onglet', () => {
    // Une section oubliée disparaîtrait du prototype, une section en double
    // ferait juger deux fois la même chose : les deux fausseraient E2.
    const vues = ONGLETS.flatMap((o) => sectionsDeLOnglet(o.cle))
    expect([...vues].sort()).toEqual([...toutes].sort())
    expect(new Set(vues).size).toBe(vues.length)
  })

  it('garde l’onglet Carte à la carte, ou presque', () => {
    // « MapView plein cadre » : Carte ne porte qu'une seule section, le
    // choix de zone — parce que choisir sa zone, c'est choisir ce que la
    // carte montre. L'issue ne place pas ZonePicker ; ce placement est un
    // jugement, et il est posé comme question à la session E2.
    expect(sectionsDeLOnglet('carte')).toEqual(['zone'])
  })

  it('remonte les trois fonctions enterrées dans Progression', () => {
    // Objectifs, prochaine sortie et découverte étaient coincées entre
    // Réglages et Sauvegarde.
    const progression = sectionsDeLOnglet('progression')
    expect(progression).toContain('objectifs')
    expect(progression).toContain('prochaineSortie')
    expect(progression).toContain('listeItineraires')
  })

  it('tient chaque onglet sous le seuil du mur déplacé', () => {
    // Le risque écrit noir sur blanc dans l'issue : « ne pas recréer dix
    // accordéons *dans* chaque onglet ». Quatre sections par onglet est le
    // maximum qu'on s'autorise ; au-delà, le mur a seulement changé de
    // place. C'est un seuil de présentation, tranché ici et écrit.
    for (const onglet of ONGLETS) {
      expect(sectionsDeLOnglet(onglet.cle).length).toBeLessThanOrEqual(4)
    }
  })
})

/**
 * AUDIT_UX.md, constat U3 — changer d'onglet ne montrait pas l'onglet.
 *
 * Mesuré sur téléphone : feuille repliée à 52 px pour regarder la carte, on
 * touche « Progression », la feuille reste à 52 px. L'onglet s'allume,
 * l'écran ne bouge pas. Il fallait deviner qu'un second geste — tirer la
 * poignée — restait à faire.
 *
 * La règle tient en une phrase : **un onglet dont tout le contenu vit dans
 * la feuille l'ouvre ; un onglet qui a du contenu ailleurs ne la touche
 * pas.** « Carte » est le seul du second genre : son contenu, c'est la
 * carte, qui est derrière la feuille et non dedans.
 *
 * Et changer d'onglet ne rétrécit jamais : quelqu'un qui a déplié en grand
 * pour lire une longue liste ne doit pas la voir se refermer parce qu'il est
 * allé voir ailleurs et revenu.
 */
describe('positionPourOnglet', () => {
  it('ouvre la feuille pour un onglet qui n’a rien à montrer ailleurs', () => {
    for (const onglet of ['sorties', 'progression', 'reglages'] as const) {
      expect(positionPourOnglet(onglet, 'repliee')).toBe('moitie')
    }
  })

  it('ne rétrécit jamais ce qui est déjà ouvert', () => {
    expect(positionPourOnglet('progression', 'moitie')).toBe('moitie')
    expect(positionPourOnglet('progression', 'pleine')).toBe('pleine')
    expect(positionPourOnglet('sorties', 'pleine')).toBe('pleine')
  })

  it('laisse « Carte » comme elle est : son contenu est derrière la feuille', () => {
    for (const position of ['repliee', 'moitie', 'pleine'] as const) {
      expect(positionPourOnglet('carte', position)).toBe(position)
    }
  })

  /**
   * L'invariant, qui vaut mieux que l'énumération : après un changement
   * d'onglet, ou bien la feuille montre quelque chose, ou bien l'onglet a du
   * contenu hors de la feuille. Jamais un écran sans rien.
   */
  it('ne laisse jamais un onglet sans rien à l’écran', () => {
    for (const onglet of ONGLETS) {
      for (const position of ['repliee', 'moitie', 'pleine'] as const) {
        const apres = positionPourOnglet(onglet.cle, position)
        const feuilleMontreQuelqueChose = apres !== 'repliee'
        const contenuHorsFeuille = onglet.cle === 'carte'
        expect(feuilleMontreQuelqueChose || contenuHorsFeuille).toBe(true)
      }
    }
  })
})
