import { describe, expect, it } from 'vitest'
import {
  COULEURS_NOMMEES,
  PEINTURE,
  figureDuBalisage,
} from '../../src/lib/balisageDisplay.ts'

/**
 * Ce qu'on accepte de dessiner, et ce qu'on refuse (issue #381).
 *
 * Les balises éprouvées ici sont **réelles** : elles viennent du relevé du
 * 29/08 sur 26 relations du Pilat, de la Loire et de l'ouest lyonnais. Des
 * chaînes inventées auraient éprouvé ma lecture de la grammaire, pas ce que
 * l'application rencontre.
 */

describe('les balises réellement rencontrées se dessinent', () => {
  it('la balise en deux moitiés d’un GR', () => {
    expect(figureDuBalisage('red::white_upper:red_lower:7:black')).toEqual({
      genre: 'moities',
      haut: PEINTURE['white'],
      bas: PEINTURE['red'],
      fond: null,
    })
  })

  it('celle d’un itinéraire régional, jaune sur rouge', () => {
    expect(
      figureDuBalisage('orange::yellow_upper:red_lower:CLY:black'),
    ).toEqual({
      genre: 'moities',
      haut: PEINTURE['yellow'],
      bas: PEINTURE['red'],
      fond: null,
    })
  })

  it('le rectangle jaune sur cartouche blanc', () => {
    expect(figureDuBalisage('yellow:white:yellow_bar')).toEqual({
      genre: 'barre',
      couleur: PEINTURE['yellow'],
      fond: PEINTURE['white'],
    })
  })

  it('le rectangle sans cartouche', () => {
    expect(figureDuBalisage('yellow::yellow_bar')).toEqual({
      genre: 'barre',
      couleur: PEINTURE['yellow'],
      fond: null,
    })
  })

  it('la crête blanche sur rouge', () => {
    expect(figureDuBalisage('red:red:white_crest')).toEqual({
      genre: 'crete',
      couleur: PEINTURE['white'],
      fond: PEINTURE['red'],
    })
  })
})

describe('ce qu’on refuse de dessiner', () => {
  /*
    La coquille moderne — une occurrence sur dix-huit, sur un chemin de
    Saint-Jacques. La phrase la nomme déjà ; un dessin approximatif
    montrerait du faux avec l'autorité d'une image.
  */
  it('la coquille, faute de savoir la dessiner', () => {
    expect(figureDuBalisage('blue:blue:shell_modern')).toBeNull()
  })

  it('une forme absente de la table', () => {
    expect(figureDuBalisage('red:white:red_arch')).toBeNull()
  })

  it('une couleur absente de la table', () => {
    expect(figureDuBalisage('red:white:cyan_bar')).toBeNull()
  })

  /*
    Une moitié haute sans moitié basse : la grammaire l'admet, le dessin non.
    Peindre la moitié haute seule donnerait une balise **différente** de
    celle qui est sur l'arbre.
  */
  it('une moitié haute orpheline', () => {
    expect(figureDuBalisage('red::white_upper')).toBeNull()
  })

  it('une moitié basse qu’on ne sait pas peindre', () => {
    expect(figureDuBalisage('red::white_upper:cyan_lower')).toBeNull()
  })

  /*
    Un fond nommé mais impeignable : on renonce à toute la figure. Dessiner
    la marque sur un cartouche de la mauvaise couleur serait pire que de ne
    rien dessiner — c'est précisément ce que la balise sert à distinguer.
  */
  it('un cartouche d’une couleur inconnue', () => {
    expect(figureDuBalisage('red:cyan:white_bar')).toBeNull()
  })

  it('rien du tout', () => {
    expect(figureDuBalisage(undefined)).toBeNull()
    expect(figureDuBalisage('')).toBeNull()
  })
})

/**
 * Les deux listes de couleurs, tenues d'être d'accord (§4ter).
 *
 * `COULEURS` dans `src/core/balisage.ts` dit comment **nommer** une couleur ;
 * `PEINTURE` ici dit comment la **peindre**. Deux modules qui ne changent
 * jamais ensemble, et une couleur ajoutée d'un seul côté produirait soit une
 * phrase sans dessin, soit un dessin sans phrase — sans que rien ne rougisse.
 */
describe('nommer et peindre couvrent les mêmes couleurs', () => {
  it('chaque couleur nommée sait être peinte', () => {
    const sansPeinture = Object.keys(COULEURS_NOMMEES).filter(
      (nom) => PEINTURE[nom] === undefined,
    )
    expect(
      sansPeinture,
      'ces couleurs se disent mais ne se dessinent pas : la fiche montrerait' +
        ' une phrase sans balise',
    ).toEqual([])
  })

  it('chaque couleur peinte sait être nommée', () => {
    const sansNom = Object.keys(PEINTURE).filter(
      (nom) => COULEURS_NOMMEES[nom] === undefined,
    )
    expect(
      sansNom,
      'ces couleurs se dessinent mais ne se disent pas : la fiche montrerait' +
        ' une balise sans phrase',
    ).toEqual([])
  })

  /*
    Et les valeurs sont des couleurs CSS lisibles. Sans ça, une faute de
    frappe dans un hexadécimal rendrait un attribut `fill` invalide, que le
    navigateur ignorerait en silence — une balise transparente.
  */
  it('chaque peinture est un hexadécimal', () => {
    for (const [nom, valeur] of Object.entries(PEINTURE)) {
      expect(valeur, `${nom} n’est pas une couleur`).toMatch(
        /^#([0-9a-f]{3}|[0-9a-f]{6})$/i,
      )
    }
  })
})
