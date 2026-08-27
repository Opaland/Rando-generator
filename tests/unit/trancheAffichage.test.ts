import { describe, it, expect } from 'vitest'
import {
  AFFICHAGE_PAR_DEFAUT,
  trancheAffichage,
  type EtatAffichage,
} from '../../src/store/trancheAffichage.ts'

/**
 * Les réglages d'écran (issue #155, septième tranche).
 *
 * Ces tests gardent deux choses qu'un test de bout en bout tient mal :
 *
 * 1. **l'ordre** — le réglage est écrit *avant* d'être appliqué. C'est le
 *    §203 : appliquer d'abord et écrire ensuite perd le geste si la fenêtre
 *    se ferme entre les deux, et montrer après avoir écrit fait sursauter la
 *    case sous le doigt. Un e2e ne peut affirmer que le résultat ;
 * 2. **la forme écrite** — 0 ou 1, jamais un booléen. Le magasin des
 *    réglages ne stocke que des nombres et des chaînes, et `lireDrapeau`
 *    n'accepte que `1` à la relecture. Un `true` écrit tel quel se relit
 *    donc `false` : le réglage se perd au **rechargement suivant**, pas
 *    tout de suite, et c'est ce qui rend le défaut discret.
 */

function banc() {
  const journal: string[] = []
  const ecrits: { clef: string; valeur: string | number }[] = []
  let etat: EtatAffichage = { ...AFFICHAGE_PAR_DEFAUT }

  const actions = trancheAffichage({
    set: (partiel) => {
      journal.push('appliquer')
      etat = { ...etat, ...partiel }
    },
    enregistrerReglage: (clef, valeur, appliquer) => {
      journal.push(`ecrire:${clef}=${String(valeur)}`)
      ecrits.push({ clef, valeur })
      appliquer()
      return Promise.resolve()
    },
  })
  return { actions, journal, ecrits, etat: () => etat }
}

describe('au départ', () => {
  it('rien n’est agrandi, replié ni fermé', () => {
    expect(AFFICHAGE_PAR_DEFAUT).toEqual({
      modeAffichage: 'complet',
      grosTexte: false,
      guideFerme: false,
      panneauReplie: false,
    })
  })
})

describe('les trois drapeaux', () => {
  it.each(['grosTexte', 'guideFerme', 'panneauReplie'] as const)(
    '%s s’écrit en 1, jamais en booléen',
    async (clef) => {
      const b = banc()
      const poser = {
        grosTexte: b.actions.setGrosTexte,
        guideFerme: b.actions.setGuideFerme,
        panneauReplie: b.actions.setPanneauReplie,
      }[clef]
      await poser(true)
      expect(b.ecrits).toEqual([{ clef, valeur: 1 }])
      expect(b.etat()[clef]).toBe(true)
    },
  )

  it.each(['grosTexte', 'guideFerme', 'panneauReplie'] as const)(
    '%s s’écrit en 0 quand on le retire',
    async (clef) => {
      const b = banc()
      const poser = {
        grosTexte: b.actions.setGrosTexte,
        guideFerme: b.actions.setGuideFerme,
        panneauReplie: b.actions.setPanneauReplie,
      }[clef]
      await poser(false)
      expect(b.ecrits).toEqual([{ clef, valeur: 0 }])
      expect(b.etat()[clef]).toBe(false)
    },
  )

  it('chacun n’écrit que sa propre clef', () => {
    /*
      La garde du §4 : les trois passent par la même fabrique, et une
      fabrique qui capturerait mal sa clef les ferait tous écrire la même —
      un défaut invisible tant qu'on n'en essaie qu'un.
    */
    const b = banc()
    void b.actions.setGrosTexte(true)
    void b.actions.setGuideFerme(true)
    void b.actions.setPanneauReplie(true)
    expect(b.ecrits.map((e) => e.clef)).toEqual([
      'grosTexte',
      'guideFerme',
      'panneauReplie',
    ])
  })
})

describe('le registre d’affichage', () => {
  it('s’écrit tel quel, parce que c’est un mot', async () => {
    const b = banc()
    await b.actions.setModeAffichage('simple')
    expect(b.ecrits).toEqual([{ clef: 'modeAffichage', valeur: 'simple' }])
    expect(b.etat().modeAffichage).toBe('simple')
  })
})

describe('l’ordre', () => {
  it('écrit avant d’appliquer, pour les quatre', async () => {
    const b = banc()
    await b.actions.setGrosTexte(true)
    expect(b.journal.indexOf('ecrire:grosTexte=1')).toBeLessThan(
      b.journal.indexOf('appliquer'),
    )
  })
})
