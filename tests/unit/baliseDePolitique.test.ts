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

  /*
    Les deux cas que la vague de mutation du 30/08 a montrés découverts, sur
    le motif de nettoyage lui-même — c'est-à-dire sur la ligne qui fait tout
    le travail de #420.

    `src/lib/` venait d'entrer dans le périmètre de mutation : ce module en
    avait été extrait de `vite.config.ts` **parce qu'il était pur, donc
    éprouvable**, et personne n'avait jamais éprouvé ses tests.
  */
  it('retire une balise que rien ne suit à la ligne', () => {
    /*
      Mutant survivant : `\n?` → `\n`, qui rend le saut de ligne
      **obligatoire**. Une balise collée à ce qui la suit n'était alors plus
      retirée — et la page en portait deux. C'est le défaut de #420 lui-même,
      reconstitué par un caractère.

      Rien ne garantit qu'un outil de mise en forme laisse un retour après
      chaque balise, et `dist/pourquoi.html` passe par des mains que nous ne
      tenons pas.
    */
    const collee = PAGE.replace(
      `${APRES_LA_BALISE}\n`,
      `${APRES_LA_BALISE}\n    ${AUTRE}`,
    )
    const rendu = poserLaPolitique(collee, BALISE, 'page collée')
    expect(combien(rendu)).toBe(1)
    expect(rendu).toContain(BALISE)
    expect(rendu).not.toContain(AUTRE)
  })

  it('retire une balise écrite avec deux espaces', () => {
    /*
      Mutant survivant : `\s+` → `\s`, une seule espace au lieu d'au moins
      une. Le motif ne reconnaissait plus `<meta  http-equiv`, et la balise
      restait — donc s'empilait.

      HTML tient deux espaces pour une ; nos tests n'en écrivaient qu'une.
    */
    const espacee = poserLaPolitique(PAGE, AUTRE, 'page de test').replace(
      '<meta http-equiv',
      '<meta  http-equiv',
    )
    expect(espacee).toContain('<meta  http-equiv')
    const rendu = poserLaPolitique(espacee, BALISE, 'page espacée')
    expect(combien(rendu)).toBe(1)
    expect(rendu).toContain(BALISE)
  })

  /*
    Deux mutants survivent encore sur ce fichier, et c'est **voulu** : les
    lignes 62-63 sont la seconde moitié du message d'erreur, celle qui
    explique la conséquence (« La page serait servie sans politique… »).

    Ce que le message doit faire est déjà gardé plus bas — il est levé, et il
    nomme le fichier fautif, qui est la seule raison d'être du paramètre
    `quoi`. Épingler la prose en plus figerait une formulation qui a le droit
    de changer. Les rechasser à la prochaine vague serait du temps perdu :
    c'est pourquoi ils sont écrits ici.
  */
  it('refuse une page sans point d’ancrage', () => {
    expect(() =>
      poserLaPolitique('<html><head></head></html>', BALISE, 'page nue'),
    ).toThrow(/introuvable dans page nue/)
  })
})
