import { describe, it, expect } from 'vitest'
import { classifyNetwork } from '../../src/core/network.ts'

describe('classifyNetwork', () => {
  it('classe selon le tag network quand il est présent', () => {
    expect(classifyNetwork({ network: 'nwn' })).toBe('GR')
    expect(classifyNetwork({ network: 'rwn' })).toBe('GRP')
    expect(classifyNetwork({ network: 'lwn' })).toBe('PR')
  })

  it('le tag network prime sur le ref', () => {
    expect(classifyNetwork({ network: 'lwn', ref: 'GR 7' })).toBe('PR')
  })

  it('retombe sur le ref quand network est absent', () => {
    expect(classifyNetwork({ ref: 'GR 7' })).toBe('GR')
    expect(classifyNetwork({ ref: 'GR7' })).toBe('GR')
    expect(classifyNetwork({ ref: 'GRP Pilat' })).toBe('GRP')
    expect(classifyNetwork({ ref: 'PR 12' })).toBe('PR')
  })

  it('GRP est testé avant GR (préfixe commun)', () => {
    expect(classifyNetwork({ ref: 'GRP' })).toBe('GRP')
  })

  /**
   * Le cœur de l'issue #284.
   *
   * `PR` était la valeur de repli : tout ce qui n'était ni `nwn`, ni `rwn`,
   * ni `lwn`, ni préfixé « GR », y tombait. Une relation qu'un contributeur
   * a saisie pour lui, une boucle d'office de tourisme, un tracé abandonné
   * à moitié — tout ressortait « PR », en jaune, à côté d'un texte qui
   * explique que le jaune veut dire « Promenade et Randonnée, circuit local
   * balisé, marque FFRandonnée ».
   *
   * L'application affirmait donc un balisage qu'elle n'avait jamais vu. Sur
   * le terrain la différence est celle entre un sentier entretenu et un
   * layon qui s'arrête dans un pré.
   */
  it('sans network ni ref reconnaissable → INCONNU, pas PR (#284)', () => {
    expect(classifyNetwork({})).toBe('INCONNU')
    expect(classifyNetwork({ name: 'Sentier des crêtes' })).toBe('INCONNU')
    expect(
      classifyNetwork({ name: 'Balcons du Pilat' }),
      'un nom joli n’est pas une déclaration de réseau',
    ).toBe('INCONNU')
  })

  /**
   * `PR` reste réservé à ce qui se déclare tel — par le tag, ou par un ref
   * qui l'écrit en toutes lettres. Ce dernier cas tombait auparavant dans le
   * repli et arrivait sur `PR` **par accident** : il aurait été perdu en
   * changeant le défaut, sans qu'aucun test ne s'en aperçoive.
   */
  it('PR est réservé à ce qui se déclare PR', () => {
    expect(classifyNetwork({ network: 'lwn' })).toBe('PR')
    expect(classifyNetwork({ ref: 'PR 12' })).toBe('PR')
    expect(classifyNetwork({ ref: 'PR12' })).toBe('PR')
  })

  it('une valeur network inconnue retombe sur le ref', () => {
    expect(classifyNetwork({ network: 'iwn', ref: 'GR 65' })).toBe('GR')
    expect(classifyNetwork({ network: 'iwn' })).toBe('INCONNU')
  })
})
