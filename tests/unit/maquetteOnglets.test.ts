import { describe, it, expect } from 'vitest'
import {
  maquetteDemandee,
  ONGLETS,
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
describe('maquetteDemandee', () => {
  it('est fausse quand rien n’est demandé', () => {
    expect(maquetteDemandee('')).toBe(false)
    expect(maquetteDemandee('?zone=pilat')).toBe(false)
  })

  it('est vraie sur le paramètre exact, et lui seul', () => {
    expect(maquetteDemandee('?maquette=onglets')).toBe(true)
    expect(maquetteDemandee('?zone=pilat&maquette=onglets')).toBe(true)
  })

  it('ignore une valeur voisine plutôt que de deviner', () => {
    // Un prototype qui s'active par erreur pendant une session fausserait
    // celle-ci sans que personne s'en aperçoive : la comparaison est stricte.
    expect(maquetteDemandee('?maquette=onglet')).toBe(false)
    expect(maquetteDemandee('?maquette=1')).toBe(false)
    expect(maquetteDemandee('?maquette=')).toBe(false)
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
