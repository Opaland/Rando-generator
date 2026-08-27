import { describe, it, expect } from 'vitest'
import { lireBalisage, decrireBalisage } from '../../src/core/balisage.ts'

/**
 * `osmc:symbol` est la notation standardisée d'OpenStreetMap pour ce qui est
 * réellement peint sur l'arbre. Sa grammaire :
 *
 *   couleur_de_voie : fond : premier_plan [: second_plan] [: texte [: couleur]]
 *
 * Sentiers la **traduit**, il ne l'interprète pas. « rectangle rouge sur fond
 * blanc » est ce que dit le tag ; en déduire « c'est un PR » serait refaire
 * l'erreur de #284 dans l'autre sens.
 *
 * L'enjeu vient du Club Vosgien (#286), qui ne balise pas en GR/GRP/PR mais
 * en formes géométriques colorées — et où la forme *est* le système de
 * navigation. Mais la notation n'a rien de vosgien : elle sert partout, et
 * c'est pour ça qu'on la lit plutôt que de coder un cas particulier.
 */

describe('lireBalisage', () => {
  it('lit les trois champs obligatoires', () => {
    expect(lireBalisage('red:white:red_bar')).toEqual({
      couleurVoie: 'red',
      fond: 'white',
      secondPlan: null,
      premierPlan: 'red_bar',
      texte: null,
    })
  })

  it('lit le texte porté par la balise', () => {
    const lu = lireBalisage('blue:white:blue_frame:7:black')
    expect(lu?.texte).toBe('7')
  })

  /**
   * Le cas qui justifie l'heuristique, et qui manquait.
   *
   * Quand la balise porte **deux** symboles, le texte glisse d'un cran :
   * `voie:fond:premier:second:texte:couleur`. Prendre bêtement le quatrième
   * champ rendrait alors « white_dot » comme s'il s'agissait d'un numéro
   * peint sur l'arbre.
   *
   * Écrit après coup : la première version des tests plaçait toujours le
   * texte en quatrième position, et une injection remplaçant l'heuristique
   * par `champs[3]` restait verte. La ligne de code était donc écrite pour
   * rien — c'est le §1 pris en flagrant délit sur du TDD pourtant sincère.
   */
  it('trouve le texte même quand un second symbole le précède', () => {
    const lu = lireBalisage('red:white:red_bar:white_dot:7:black')
    expect(
      lu?.texte,
      'un nom de symbole a été pris pour le texte de la balise',
    ).toBe('7')
  })

  it('ne prend pas un second symbole pour un texte', () => {
    expect(lireBalisage('red:white:red_bar:white_dot')?.texte).toBeNull()
  })

  /**
   * Un tag qui n'a pas la forme attendue ne se devine pas : on rend `null`,
   * et l'appelant n'affiche rien. Inventer un balisage à partir d'une chaîne
   * qu'on n'a pas comprise serait pire que de se taire.
   */
  it('rend null sur ce qui n’a pas la forme attendue', () => {
    expect(lireBalisage('')).toBeNull()
    expect(lireBalisage('rouge')).toBeNull()
    expect(lireBalisage('red:white')).toBeNull()
    expect(lireBalisage(undefined)).toBeNull()
  })

  it('tolère les espaces autour des champs', () => {
    expect(lireBalisage(' red : white : red_dot ')?.premierPlan).toBe('red_dot')
  })
})

describe('decrireBalisage', () => {
  it('dit la forme et la couleur, en français', () => {
    expect(decrireBalisage('red:white:red_bar')).toBe(
      'rectangle rouge sur fond blanc',
    )
    expect(decrireBalisage('blue:white:blue_dot')).toBe(
      'disque bleu sur fond blanc',
    )
    expect(decrireBalisage('yellow:white:yellow_triangle')).toBe(
      'triangle jaune sur fond blanc',
    )
  })

  it('ajoute le texte quand la balise en porte un', () => {
    expect(decrireBalisage('blue:white:blue_frame:7:black')).toBe(
      'cadre bleu sur fond blanc, marqué « 7 »',
    )
  })

  /**
   * Le balisage blanc-rouge des GR s'écrit `red:white:red_bar` chez certains
   * contributeurs et `white:white:red_bar` chez d'autres. On décrit ce qui
   * est écrit, sans corriger : corriger supposerait de savoir, et on ne sait
   * pas.
   */
  it('ne corrige pas ce qu’elle lit', () => {
    expect(decrireBalisage('white:white:red_bar')).toBe(
      'rectangle rouge sur fond blanc',
    )
  })

  /**
   * Une forme inconnue de la table ne se traduit pas par un mot inventé.
   * On rend `null` : la fiche n'affichera pas de ligne « balisage » plutôt
   * que d'en afficher une fausse.
   */
  it('rend null quand la forme n’est pas dans la table', () => {
    expect(decrireBalisage('red:white:red_pretzel')).toBeNull()
    expect(decrireBalisage('mauve:white:mauve_bar')).toBeNull()
  })

  it('rend null sur un tag illisible', () => {
    expect(decrireBalisage('n’importe quoi')).toBeNull()
    expect(decrireBalisage(undefined)).toBeNull()
  })
})


/**
 * Le second symbole (issue #290), trouvé par la revue de persona du sprint 2.
 *
 * Marc, baliseur bénévole : la grammaire d'`osmc:symbol` admet **deux**
 * premiers plans —
 *
 *     voie : fond : premier_plan : second_plan : texte : couleur_texte
 *
 * — et nous n'en lisions qu'un. Un sentier balisé « rectangle rouge **et**
 * disque blanc » était décrit comme un simple rectangle rouge : pas faux,
 * incomplet, et incomplet **en silence**.
 */
describe('le second symbole (#290)', () => {
  it('décrit les deux symboles quand la balise en porte deux', () => {
    expect(decrireBalisage('red:white:red_bar:white_dot')).toBe(
      'rectangle rouge et disque blanc sur fond blanc',
    )
  })

  it('accorde le second symbole comme le premier', () => {
    // « bande blanche », pas « bande blanc ». L'accord se fait sur la forme,
    // et il se posait déjà pour le premier : la question est nommée une fois
    // (§4) plutôt que recopiée pour le second.
    expect(decrireBalisage('red:white:red_bar:white_stripe')).toBe(
      'rectangle rouge et bande blanche sur fond blanc',
    )
  })

  it('ne confond pas un second symbole avec un texte de balise', () => {
    // La grammaire est positionnelle : le quatrième champ est un second
    // symbole s'il porte un `_`, un texte sinon. « 7 » est un texte.
    expect(decrireBalisage('red:white:red_bar:7')).toBe(
      'rectangle rouge sur fond blanc, marqué « 7 »',
    )
    expect(lireBalisage('red:white:red_bar:7')?.secondPlan).toBeNull()
  })

  it('porte les deux et le texte', () => {
    expect(decrireBalisage('red:white:red_bar:white_dot:7')).toBe(
      'rectangle rouge et disque blanc sur fond blanc, marqué « 7 »',
    )
  })

  it('dit qu’il y a un second symbole même quand il ne sait pas le lire', () => {
    /*
      Le cœur de l'issue. Trois façons de traiter un second symbole absent
      de nos tables, et deux sont mauvaises :

      - rendre `null` pour tout le tag perdrait un premier symbole
        parfaitement lu ;
      - l'ignorer rendrait une description incomplète **qui a l'air
        complète** — c'est exactement ce que #290 reproche ;
      - le dire coûte huit mots et ne ment pas.
    */
    const texte = decrireBalisage('red:white:red_bar:mauve_hexagone')
    expect(texte).toContain('rectangle rouge sur fond blanc')
    expect(texte).toMatch(/second symbole/i)
  })

  it('ignore la couleur du texte, qui n’est pas un symbole', () => {
    // Sixième champ de la grammaire. Sans `_`, il ne peut pas être pris pour
    // un symbole ; et il ne doit pas non plus être pris pour le texte, qui
    // est le champ d'avant.
    expect(decrireBalisage('red:white:red_bar:white_dot:7:black')).toBe(
      'rectangle rouge et disque blanc sur fond blanc, marqué « 7 »',
    )
  })
})


/**
 * Les moitiés de balise (issue #290, mesuré le 27/08).
 *
 * Sur 1 035 relations pédestres des Vosges, 33 portent un `osmc:symbol` que
 * nous ne savons pas lire. La mesure a dit lesquelles, et elle a **réfuté**
 * ce que j'avais annoncé une heure plus tôt : je pensais que le fond vide
 * était la moitié du problème, et **zéro** cas échouait pour cette raison.
 * Toutes échouent sur une forme absente de la table :
 *
 *     18 × upper      5 × right      1 × modern
 *
 * `lower` y était pourtant depuis toujours, traduit « demi-disque » — ce qui
 * affirme une forme ronde que la notation ne dit pas. Les quatre moitiés vont
 * ensemble, et se disent littéralement.
 */
describe('les moitiés de balise (#290)', () => {
  it('nomme la moitié sans affirmer la forme du support', () => {
    // « moitié inférieure rouge » est vraie que la balise soit ronde, carrée
    // ou triangulaire. « demi-disque rouge » ne l'est que si elle est ronde,
    // et le wiki qui le dirait est hors d'atteinte depuis cette machine.
    expect(decrireBalisage('red:white:red_lower')).toBe(
      'moitié inférieure rouge sur fond blanc',
    )
  })

  it('lit les trois moitiés qui manquaient', () => {
    expect(decrireBalisage('red:white:white_upper')).toBe(
      'moitié supérieure blanche sur fond blanc',
    )
    expect(decrireBalisage('red:white:red_right')).toBe(
      'moitié droite rouge sur fond blanc',
    )
    expect(decrireBalisage('red:white:green_left')).toBe(
      'moitié gauche verte sur fond blanc',
    )
  })

  it('accorde la couleur au féminin, comme « moitié » l’exige', () => {
    // Le piège du genre : « moitié supérieure blanc » se lit mal et se
    // remarque. L'accord se fait sur la forme, et les quatre moitiés sont
    // féminines.
    expect(decrireBalisage('red:white:white_upper')).toContain('blanche')
    expect(decrireBalisage('red:white:green_lower')).toContain('verte')
  })

  it('lit une balise à deux moitiés, qui est le cas vosgien courant', () => {
    // `orange::yellow_upper:red_lower` — la forme la plus fréquente parmi les
    // illisibles, et elle porte **deux** symboles : c'est le second plan
    // livré le 26/08 qui la rend descriptible d'un coup.
    expect(decrireBalisage('red:white:yellow_upper:red_lower:501')).toBe(
      'moitié supérieure jaune et moitié inférieure rouge sur fond blanc, marqué « 501 »',
    )
  })

  it('nomme la coquille de Saint-Jacques, ancienne ou moderne', () => {
    /*
      `shell_modern` est un nom de forme **entier**, pas un `couleur_forme` :
      le découpage au premier `_` en ferait « couleur *shell*, forme
      *modern* ». Le symbole n'y porte pas de couleur propre, et on ne lui en
      invente pas — annoncer une couleur qu'on n'aura pas devant les yeux est
      exactement ce que ce module refuse de faire.
    */
    expect(decrireBalisage('blue:blue:shell_modern')).toBe(
      'coquille sur fond bleu',
    )
    expect(decrireBalisage('blue:blue:yellow_shell')).toBe(
      'coquille jaune sur fond bleu',
    )
  })
})


/**
 * Les champs qui ont le droit d'être vides (issue #290, mesuré le 27/08).
 *
 * La mesure s'est corrigée elle-même en deux temps, et c'est instructif :
 *
 * - **premier passage** : « aucun des 33 illisibles n'échoue à cause du fond
 *   vide ». Vrai — ils échouaient tous sur `upper` ou `right`, absents de la
 *   table ;
 * - **second passage**, une fois `upper` ajouté : quinze d'entre eux
 *   n'échouent plus **que** pour cette raison.
 *
 * Les deux constats sont exacts à leur instant. C'est le §4bis pris sur le
 * fait : une conclusion vieillit dès que ce qu'elle décrit a bougé.
 */
describe('les champs vides de la notation (#290)', () => {
  it('accepte un fond vide : le symbole est peint sans cartouche', () => {
    // `red::white_upper:red_lower:501:black` — la forme la plus fréquente
    // des Vosges, quinze relations sur 1 035.
    expect(decrireBalisage('red::white_upper:red_lower:501:black')).toBe(
      'moitié supérieure blanche et moitié inférieure rouge, marqué « 501 »',
    )
  })

  it('n’invente pas de fond quand il n’y en a pas', () => {
    // La clause « sur fond … » disparaît, elle ne devient pas « sur fond
    // blanc » — un cartouche blanc et pas de cartouche ne se ressemblent pas
    // sur un tronc d'arbre.
    expect(decrireBalisage('red::red_bar')).toBe('rectangle rouge')
    expect(decrireBalisage('red::red_bar')).not.toContain('fond')
  })

  it('décrit une balise qui ne porte qu’un texte', () => {
    // `red:red::IVV:white` — sept relations vosgiennes. Sans symbole à
    // décrire il reste le mot, et c'est tout ce qu'on dira.
    expect(decrireBalisage('red:red::IVV:white')).toBe(
      'balise sur fond rouge, marquée « IVV »',
    )
  })

  it('refuse ce qui n’a vraiment rien à décrire', () => {
    // Ni fond, ni symbole, ni texte : il n'y a pas de phrase à écrire, et
    // une ligne « Balisé : » vide vaut moins que pas de ligne du tout.
    expect(decrireBalisage('red::')).toBeNull()
    expect(decrireBalisage('red:white:')).toBeNull()
  })

  it('refuse toujours un fond qu’il ne sait pas nommer', () => {
    // Un fond vide est une absence déclarée ; un fond « mauve » est une
    // couleur qu'on ne sait pas rendre. Les confondre ferait taire le
    // cartouche au lieu de dire qu'on ne l'a pas compris.
    expect(decrireBalisage('red:mauve:red_bar')).toBeNull()
  })
})
