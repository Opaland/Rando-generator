import { describe, it, expect } from 'vitest'
import {
  COULEURS,
  FEMININ,
  FEMININ_DES_COULEURS,
  decrireBalisage,
} from '../../src/core/balisage.ts'

/**
 * L'accord des couleurs du balisage (issue #343).
 *
 * ## Les deux fautes que ce test aurait vues
 *
 * Mesurées le 27/08, sur la version d'alors :
 *
 * ```
 * blue:white:blue_stripe   → « bande bleu sur fond blanc »
 * black:white:black_cross  → « croix noir sur fond blanc »
 * red:green:red_bar        → « rectangle rouge sur fond verte »
 * red:purple:red_bar       → « rectangle rouge sur fond violette »
 * ```
 *
 * Deux fautes **de sens opposé**, et une seule cause : une table unique
 * servait deux accords différents. Elle manquait de féminins là où la forme
 * en réclamait un, et en imposait un à « fond », qui est masculin — avec une
 * exception écrite à la main pour `blanc`, la seule couleur où quelqu'un
 * avait remarqué le problème.
 *
 * ## Pourquoi le produit entier, et pas quatre exemples
 *
 * `FEMININ` et `FEMININ_DES_COULEURS` disent la **même** règle d'accord depuis
 * deux endroits, et rien ne les confrontait — le §4ter. Les deux tables sont
 * finies : dix couleurs, une trentaine de formes. Le produit se parcourt donc
 * en entier, et une couleur ou une forme neuve ne peut plus arriver sans que
 * son accord soit tranché.
 *
 * ## Ce que ce fichier **ne** garde **pas**, et il faut le dire
 *
 * Le parcours du produit tire son attendu de `FEMININ_DES_COULEURS`
 * elle-même. Il vérifie donc que le code **consulte** la table — vérifié en
 * retirant la consultation : quarante rouges — mais il ne peut pas juger du
 * français. Remettre `bleu: null` ne le fait pas broncher : il attend alors
 * « bande bleu », et l'obtient.
 *
 * Ce qui garde la table est ailleurs, et c'est plus modeste :
 *
 * - l'**exhaustivité** — une couleur sans entrée fait rougir, donc une
 *   couleur neuve force une décision ;
 * - les deux **cas nommés**, `bleu` et `noir`, qui sont la régression de
 *   #343 et rougissent si on les reperd ;
 * - « sur fond », qui est masculin **quoi qu'il arrive** et ne dépend
 *   d'aucune table.
 *
 * Dire qu'un test couvre ce qu'il ne couvre pas serait exactement ce que le
 * §1 reproche : une assertion verte pour une raison qu'on n'a pas voulue.
 */

const COULEURS_FR = [...new Set(Object.values(COULEURS))]

describe('la table des féminins', () => {
  it('a une entrée pour chaque couleur, invariable comprise', () => {
    /*
      C'est la garde qui compte. Avant, une couleur oubliée était
      indiscernable d'une couleur invariable : l'absence valait « rien à
      accorder ». `null` rend le silence impossible — il faut décider.
    */
    const sansEntree = COULEURS_FR.filter(
      (c) => !(c in FEMININ_DES_COULEURS),
    )
    expect(sansEntree, `couleurs sans accord décidé : ${sansEntree.join(', ')}`).toEqual([])
  })

  it('n’invente pas de couleur que la notation ne connaît pas', () => {
    const inconnues = Object.keys(FEMININ_DES_COULEURS).filter(
      (c) => !COULEURS_FR.includes(c),
    )
    expect(inconnues).toEqual([])
  })

  it('bleu et noir ont bien un féminin — les deux qui manquaient', () => {
    expect(FEMININ_DES_COULEURS['bleu']).toBe('bleue')
    expect(FEMININ_DES_COULEURS['noir']).toBe('noire')
  })
})

/** Les symboles `couleur_forme` que la notation permet d'écrire. */
function symbolesPossibles(): { tag: string; forme: string; couleur: string }[] {
  const sortie: { tag: string; forme: string; couleur: string }[] = []
  for (const [en, fr] of Object.entries(COULEURS)) {
    for (const forme of ['stripe', 'cross', 'pointer', 'bar', 'dot', 'lower']) {
      sortie.push({
        tag: `red:white:${en}_${forme}`,
        forme,
        couleur: fr,
      })
    }
  }
  return sortie
}

describe('la couleur s’accorde avec la forme', () => {
  it.each(symbolesPossibles())(
    '$tag',
    ({ tag, couleur }) => {
      const phrase = decrireBalisage(tag)
      expect(phrase).not.toBeNull()
      const feminin = FEMININ_DES_COULEURS[couleur]
      // La forme employée dans la phrase : féminine si la forme l'est.
      const formeDecrite = (phrase as string).replace(/ sur fond .*$/, '')
      const estFeminine = [...FEMININ].some((f) => formeDecrite.startsWith(f))
      const attendue = estFeminine && feminin ? feminin : couleur
      expect(
        formeDecrite.endsWith(attendue),
        `« ${formeDecrite} » : attendu « ${attendue} » en fin`,
      ).toBe(true)
    },
  )
})

describe('« sur fond » ne s’accorde jamais', () => {
  it.each(Object.entries(COULEURS))('fond %s', (en, fr) => {
    /*
      « fond » est masculin. La version d'avant mettait le féminin de la
      couleur ici, avec une exception codée en dur pour `blanc` — le
      symptôme rattrapé sur le seul cas remarqué, jamais la cause.
    */
    const phrase = decrireBalisage(`red:${en}:red_bar`)
    expect(phrase).toBe(`rectangle rouge sur fond ${fr}`)
  })
})

/**
 * Les balises sans forme (mesure du Rhône, #290).
 *
 * Treize relations sur cent cinquante-sept portaient un `osmc:symbol`
 * **valide** que `decrireBalisage` refusait — 8 % du département, dont la
 * fiche n'affichait aucune ligne de balisage alors que la donnée était là et
 * descriptible. Deux familles.
 */
describe('une balise sans symbole dessus', () => {
  it('se dit quand même, en forme courte', () => {
    // `blue:blue` — la grammaire admet deux champs, nous en exigions trois.
    expect(decrireBalisage('blue:blue')).toBe('balise sur fond bleu')
    expect(decrireBalisage('red:red')).toBe('balise sur fond rouge')
  })

  it('refuse le champ unique, qui ne décrit aucune balise', () => {
    // `red` seul ne dit que la couleur de la voie.
    expect(decrireBalisage('red')).toBeNull()
  })

  it('garde le texte quand il y en a un', () => {
    expect(decrireBalisage('red:red::IVV:white')).toBe(
      'balise sur fond rouge, marquée « IVV »',
    )
  })
})

describe('un premier plan qui est une couleur nue', () => {
  it('se décrit comme une marque, sans inventer de forme', () => {
    /*
      `white:white:white:SR 1:red` — le champ dit la couleur de ce qui est
      peint, pas sa géométrie. « aplat » affirmerait une surface pleine que
      la notation ne garantit pas.
    */
    expect(decrireBalisage('white:white:white:SR 1:red')).toBe(
      'marque blanche sur fond blanc, marquée « SR 1 »',
    )
  })

  it('accorde la couleur, parce que « marque » est féminin', () => {
    expect(decrireBalisage('blue:yellow:black:QB:black')).toBe(
      'marque noire sur fond jaune, marquée « QB »',
    )
  })

  it('n’avale pas un nom de forme inconnu pour autant', () => {
    // `zigzag` n'est ni une couleur ni une forme connue : on rend `null`
    // plutôt qu'une description approximative (#286).
    expect(decrireBalisage('red:white:zigzag')).toBeNull()
  })
})
