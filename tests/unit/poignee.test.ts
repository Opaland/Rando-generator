import { describe, it, expect } from 'vitest'
import { libellePoignee } from '../../src/core/poignee.ts'

/**
 * Ce que la poignée de la feuille annonce, sur téléphone.
 *
 * C'est la seule ligne toujours visible au-dessus de la barre d'onglets
 * quand la feuille est repliée pour regarder la carte. Elle a donc trois
 * choses à dire selon le moment, et une seule à la fois.
 *
 * Le troisième cas est né de la revue du 23/08 : pendant qu'une sortie
 * s'enregistre, la poignée annonçait toujours « Zones, traces et
 * réglages ». La feuille de route demande pourtant « rien qui demande de
 * sortir le téléphone toutes les deux minutes » — or il fallait déplier la
 * feuille et changer d'onglet pour lire sa distance.
 */

describe('le libellé de la poignée', () => {
  it('dit ce que la feuille contient quand il n’y a rien à compter', () => {
    expect(libellePoignee({ sortie: null, pourcentage: null })).toBe(
      'Zones, traces et réglages',
    )
  })

  it('dit la progression dès qu’il y a de quoi la calculer', () => {
    expect(libellePoignee({ sortie: null, pourcentage: 54.5 })).toBe(
      '54,5 % parcourus',
    )
  })

  /**
   * La sortie en cours passe devant la progression globale, et ce n'est pas
   * un caprice de mise en page : pendant qu'on marche, le chiffre qui
   * change chaque minute est celui de la sortie. Le pourcentage global, lui,
   * attendra le retour.
   */
  it('passe à la sortie en cours dès qu’il y en a une', () => {
    expect(
      libellePoignee({
        sortie: { distanceMetres: 2_430, dureeEnMarcheMs: 2_520_000 },
        pourcentage: 54.5,
      }),
    ).toBe('2,4 km · 42:00')
  })

  it('annonce la sortie avant sa première position, sans mentir sur zéro', () => {
    expect(
      libellePoignee({
        sortie: { distanceMetres: 0, dureeEnMarcheMs: 0 },
        pourcentage: null,
      }),
    ).toBe('Sortie en cours')
  })

  it('bascule sur les chiffres dès qu’il y a une distance', () => {
    expect(
      libellePoignee({
        sortie: { distanceMetres: 120, dureeEnMarcheMs: 65_000 },
        pourcentage: null,
      }),
    ).toBe('120 m · 1:05')
  })
})
