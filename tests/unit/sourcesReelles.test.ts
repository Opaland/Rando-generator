import { describe, it, expect } from 'vitest'
import { verdictDe, etatGlobal, rapport, type Etat, type Resultat } from '../../scripts/sources/verdict.ts'

/*
  Le tri des réponses des sources publiques (issue #669) : ce qui doit
  ouvrir une issue, et ce qui ne dit rien de la source. Modèle : le flux
  `sources.yml` du dépôt Netatmo — une source injoignable est ignorée, une
  source qui a changé de forme est rouge.
*/
describe('verdictDe', () => {
  it('ignore une source injoignable : le réseau ne dit rien de son format', () => {
    expect(verdictDe({ erreur: 'fetch failed' })).toEqual({
      etat: 'ignoree',
      motif: 'injoignable (fetch failed)',
    })
  })

  it('ignore une source surchargée ou en panne passagère', () => {
    for (const statut of [429, 500, 502, 503, 504]) {
      expect(verdictDe({ statut }).etat).toBe('ignoree')
    }
  })

  it('rend rouge un refus ou une adresse disparue : datARA est passé à 403 le 22/10 (#20)', () => {
    for (const statut of [400, 401, 403, 404, 410]) {
      expect(verdictDe({ statut })).toEqual({ etat: 'rouge', motif: `HTTP ${String(statut)}` })
    }
  })

  it('rend rouge une réponse 200 qui n’a plus la forme attendue', () => {
    expect(verdictDe({ statut: 200, problemes: ['aucune boucle retenue (g_diffusion)'] })).toEqual({
      etat: 'rouge',
      motif: 'aucune boucle retenue (g_diffusion)',
    })
  })

  /*
    Relecture adverse de #669 : Overpass surchargé répond 200, sans données,
    avec un `remark` (`estUnEchecDeserveur`, core/overpass.ts). C'était rouge,
    et ouvrait une issue « format changé » pour une simple surcharge.
  */
  it('ignore une réponse 200 que la source dit elle-même avortée', () => {
    expect(
      verdictDe({ statut: 200, passager: 'remark sans données', problemes: ['aucun itinéraire'] }),
    ).toEqual({ etat: 'ignoree', motif: 'remark sans données' })
  })

  it('rend vert une réponse 200 sans problème', () => {
    expect(verdictDe({ statut: 200, problemes: [] })).toEqual({ etat: 'verte', motif: '' })
  })
})

describe('etatGlobal', () => {
  const r = (etat: Etat): Resultat => ({ nom: 'x', etat, motif: '', mesure: '' })

  it('est rouge dès qu’une source l’est, même si d’autres sont ignorées', () => {
    expect(etatGlobal([r('verte'), r('ignoree'), r('rouge')])).toBe('rouge')
  })

  /*
    Une source ignorée n'a rien prouvé : l'issue ouverte pour elle ne se
    referme pas sur un passage où elle n'a pas répondu.
  */
  it('est incomplet sans rouge mais avec une source ignorée', () => {
    expect(etatGlobal([r('verte'), r('ignoree')])).toBe('incomplet')
  })

  it('est vert seulement quand toutes ont répondu dans la forme attendue', () => {
    expect(etatGlobal([r('verte'), r('verte')])).toBe('vert')
  })
})

describe('rapport', () => {
  it('nomme chaque source, son état, son motif et sa mesure, sans rien d’autre', () => {
    const texte = rapport(
      [
        { nom: 'PDIPR Ain', etat: 'rouge', motif: 'aucune boucle retenue', mesure: '412 entités' },
        { nom: 'Overpass', etat: 'ignoree', motif: 'HTTP 504', mesure: '' },
      ],
      '2026-11-12',
    )
    expect(texte).toContain('| PDIPR Ain | rouge | aucune boucle retenue | 412 entités |')
    expect(texte).toContain('| Overpass | ignorée | HTTP 504 |  |')
    expect(texte).toContain('2026-11-12')
  })

  it('neutralise une barre verticale venue d’une source, qui casserait le tableau', () => {
    const texte = rapport([{ nom: 'S', etat: 'rouge', motif: 'champ a|b', mesure: '' }], 'j')
    expect(texte).toContain('| S | rouge | champ a\\|b |  |')
  })

  /*
    Le rapport devient le corps d'une issue : un champ nommé « @quelqu'un »
    par un producteur y notifierait un compte GitHub au hasard.
  */
  it('échappe l’antislash avant la barre : « a\\|b » ne doit pas rouvrir une colonne', () => {
    const texte = rapport([{ nom: 'S', etat: 'rouge', motif: '', mesure: 'a\\|b' }], 'j')
    const ligne = texte.split('\n').find((l) => l.startsWith('| S |')) ?? ''
    // Quatre cellules : cinq barres non échappées, pas six.
    expect(ligne.replace(/\\./g, '').split('|').length - 1).toBe(5)
  })

  it('ne laisse aucune mention GitHub passer d’une source au rapport', () => {
    const texte = rapport([{ nom: 'S', etat: 'rouge', motif: '', mesure: 'champs : @octocat' }], 'j')
    expect(texte).not.toMatch(/@octocat/)
    expect(texte).toContain('@\u200boctocat')
  })
})
