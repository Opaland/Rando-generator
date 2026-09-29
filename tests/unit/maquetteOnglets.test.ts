import { describe, it, expect } from 'vitest'
import {
  dispositionDemandee,
  MAX_SECTIONS_PAR_ONGLET,
  ONGLETS,
  positionInitiale,
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
    expect(dispositionDemandee('?zone=pilat&maquette=accordeons')).toBe(
      'accordeons',
    )
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
    'enregistrement',
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
    /*
      Le risque écrit noir sur blanc dans l'issue #171 : « ne pas recréer
      dix accordéons *dans* chaque onglet ». Au-delà de quatre sections, le
      mur a seulement changé de place.

      Le seuil est **importé**, pas recopié. Il l'était : le module
      exportait `MAX_SECTIONS_PAR_ONGLET` en écrivant que le nombre est
      « vérifié par un test plutôt que laissé à la vigilance », et le test
      écrivait `4` en dur. Deux endroits pour un même nombre, qui pouvaient
      diverger sans que rien ne le dise — le §4ter — et un export dont
      aucun test ne se servait, qui est mot pour mot la cicatrice du §4bis.
    */
    for (const onglet of ONGLETS) {
      expect(sectionsDeLOnglet(onglet.cle).length).toBeLessThanOrEqual(
        MAX_SECTIONS_PAR_ONGLET,
      )
    }
  })

  it('ne laisse pas le seuil devenir permissif sans qu’on le voie', () => {
    /*
      Importer la constante rend le test d'accord avec le module — mais un
      test qui n'asserte que « ≤ la constante » passerait au vert si
      quelqu'un portait la constante à dix. Le nombre est un choix de
      conception qui vient de l'issue : il se relit, donc il s'asserte.
    */
    expect(MAX_SECTIONS_PAR_ONGLET).toBe(4)
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
 * La règle tient en une phrase pour les trois onglets dont tout le contenu
 * vit dans la feuille : elle s'ouvre en arrivant, et changer d'onglet ne la
 * rétrécit jamais — quelqu'un qui a déplié en grand pour lire une longue
 * liste ne doit pas la voir se refermer parce qu'il est allé voir ailleurs
 * et revenu.
 *
 * « Carte » suit une règle inverse, et c'était faux avant le 29/09.
 * L'ancienne version la laissait telle quelle, au nom du même principe — un
 * aller-retour ne doit rien réduire. Mesuré en vrai (Pixel 7, #171) : en
 * dépliant « Sorties » en pleine hauteur puis en retapant « Carte », la carte
 * restait à 7 % de l'écran (56 px sur 855), cachée par le panneau de
 * l'onglet précédent — alors que « Carte » est justement l'onglet dont le
 * contenu utile est *derrière* la feuille, pas dedans. Le coût qui avait fait
 * écarter le repli — perdre sa place dans la liste des zones après un
 * aller-retour — est réel mais mineur à côté d'une carte invisible sur
 * l'onglet qui n'existe que pour elle. « Carte » replie donc systématiquement
 * en arrivant.
 */
describe('positionPourOnglet', () => {
  it('ouvre la feuille pour un onglet qui n’a rien à montrer ailleurs', () => {
    for (const onglet of ['sorties', 'progression', 'reglages'] as const) {
      expect(positionPourOnglet(onglet, 'repliee')).toBe('moitie')
    }
  })

  it('ne rétrécit jamais ce qui est déjà ouvert, sauf pour « Carte »', () => {
    expect(positionPourOnglet('progression', 'moitie')).toBe('moitie')
    expect(positionPourOnglet('progression', 'pleine')).toBe('pleine')
    expect(positionPourOnglet('sorties', 'pleine')).toBe('pleine')
  })

  it('replie la feuille en arrivant sur « Carte », quelle que soit la position de départ', () => {
    for (const position of ['repliee', 'moitie', 'pleine'] as const) {
      expect(positionPourOnglet('carte', position)).toBe('repliee')
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

/**
 * AUDIT_UX.md, constat U1 — le défaut le plus grave de l'audit, parce qu'il
 * frappe la première seconde de la première visite.
 *
 * Mesuré sur 390 × 844 : la carte du guide va de y 191 à 708, la feuille
 * commence à y 439, et le bouton « Voir un exemple » est à y 485 — donc
 * 46 px sous le bord de la feuille. `elementFromPoint` en son centre ne
 * renvoyait pas le bouton : recouvert, non cliquable. C'est pourtant le seul
 * chemin qui montre le produit à quelqu'un qui n'a encore aucune trace.
 *
 * Remonter le guide au-dessus de la feuille a été envisagé et écarté : le
 * guide dit « choisissez une zone **dans le panneau** », il ne peut pas le
 * recouvrir en le désignant. C'est la feuille qui lui laisse la place, et
 * qui la reprend dès qu'il est fermé.
 */
describe('positionInitiale', () => {
  it('laisse la place au guide de premier lancement', () => {
    expect(positionInitiale({ guideAffiche: true, zoneRestauree: false })).toBe(
      'repliee',
    )
  })

  it('rouvre à mi-hauteur dès que le guide est fermé', () => {
    expect(
      positionInitiale({ guideAffiche: false, zoneRestauree: false }),
    ).toBe('moitie')
  })

  /**
   * Le comportement d'origine, qu'il ne s'agissait pas de perdre : au retour
   * sur l'application, une zone est déjà en cache — on vient regarder sa
   * carte, la feuille reste basse.
   */
  it('reste basse au retour, quand une zone est déjà là', () => {
    expect(positionInitiale({ guideAffiche: false, zoneRestauree: true })).toBe(
      'repliee',
    )
  })

  it('reste basse au retour même si le guide s’affiche', () => {
    expect(positionInitiale({ guideAffiche: true, zoneRestauree: true })).toBe(
      'repliee',
    )
  })
})
