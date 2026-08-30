import { describe, it, expect } from 'vitest'
import {
  APRES_LA_BALISE,
  poserLaPolitique,
} from '../../src/lib/baliseDePolitique.ts'

/**
 * La politique se pose une fois, quel que soit le nombre de passages (#420).
 *
 * Le greffon ajoutait sans regarder. Il était idempotent parce que Vite vide
 * `dist/`, pas parce qu'il savait l'être — et deux constructions qui se
 * chevauchent ont produit **trois** balises identiques dans
 * `dist/pourquoi.html`.
 */

const PAGE = `<!doctype html>
<html lang="fr">
  <head>
    ${APRES_LA_BALISE}
    <title>Sentiers</title>
  </head>
  <body></body>
</html>`

const BALISE = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'" />'
const AUTRE = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'" />'

/** Combien de balises de politique porte une page. */
function combien(html: string): number {
  return html.split('http-equiv="Content-Security-Policy"').length - 1
}

describe('poser la politique dans une page (#420)', () => {
  it('la pose quand il n’y en a pas', () => {
    const rendu = poserLaPolitique(PAGE, BALISE, 'page de test')
    expect(combien(rendu)).toBe(1)
    expect(rendu).toContain(BALISE)
  })

  it('deux passages ne valent pas deux balises', () => {
    const une = poserLaPolitique(PAGE, BALISE, 'page de test')
    const deux = poserLaPolitique(une, BALISE, 'page de test')
    expect(combien(deux)).toBe(1)
    expect(
      deux,
      'un second passage doit rendre exactement la même page : c’est la' +
        ' définition de l’idempotence, et c’est ce qui manquait.',
    ).toBe(une)
  })

  /**
   * Le cas qui rendait la garantie fausse plutôt que seulement laide : deux
   * constructions avec **deux politiques différentes**. Empilées, un
   * navigateur applique leur intersection — donc la plus stricte —, et une
   * politique trop stricte rend la carte grise sans rien dire.
   */
  it('remplace une politique différente au lieu de l’ajouter', () => {
    const ancienne = poserLaPolitique(PAGE, AUTRE, 'page de test')
    const neuve = poserLaPolitique(ancienne, BALISE, 'page de test')
    expect(combien(neuve)).toBe(1)
    expect(neuve).toContain(BALISE)
    expect(neuve).not.toContain(AUTRE)
  })

  /*
    Le motif de nettoyage s'arrête au premier `>`. S'il était gourmand, il
    avalerait tout ce qui suit dans le `<head>` — et la page perdrait son
    titre sans que la balise, elle, manque à l'appel.
  */
  it('ne mange pas le reste de l’en-tête', () => {
    const deux = poserLaPolitique(
      poserLaPolitique(PAGE, BALISE, 'page de test'),
      BALISE,
      'page de test',
    )
    expect(deux).toContain('<title>Sentiers</title>')
    expect(deux).toContain(APRES_LA_BALISE)
  })

  it('refuse une page sans point d’ancrage', () => {
    expect(() =>
      poserLaPolitique('<html><head></head></html>', BALISE, 'page nue'),
    ).toThrow(/introuvable dans page nue/)
  })
})
