import { describe, it, expect } from 'vitest'
import {
  SEUIL_FACILE_MINUTES,
  SEUIL_MOYEN_MINUTES,
  effortEstime,
  libelleEffort,
} from '../../src/core/discovery.ts'
import type { ItineraryFacts } from '../../src/core/discovery.ts'

/**
 * Issue #156, seconde partie — « 420 m D+ » ne dit pas « facile ».
 *
 * Un chiffre brut demande une expérience que celui qui débute n'a pas
 * encore. C'est le même reproche que celui fait au vocabulaire du premier
 * écran (#145), sous une autre forme.
 *
 * **Ce n'est pas une cotation.** Nous n'avons ni le droit ni la donnée d'une
 * cotation FFRandonnée, et le libellé doit l'empêcher de passer pour telle.
 *
 * Les bornes sont des **paliers d'affichage** : elles ne changent rien à ce
 * qui est calculé, seulement le mot posé dessus. CLAUDE.md §2 autorise à les
 * trancher au jugement, à condition de les écrire — c'est fait dans le code,
 * avec les pistes écartées.
 */

function faits(partiel: Partial<ItineraryFacts> = {}): ItineraryFacts {
  return {
    meters: 10_000,
    gainMeters: 300,
    minutes: 150,
    minutesSource: 'estimated',
    shape: 'loop',
    awayMeters: null,
    ...partiel,
  }
}

describe('effortEstime', () => {
  it('appelle facile ce qui tient dans une matinée', () => {
    expect(effortEstime(faits({ minutes: SEUIL_FACILE_MINUTES }))).toBe('facile')
    expect(effortEstime(faits({ minutes: 60 }))).toBe('facile')
  })

  it('appelle moyen ce qui prend une journée', () => {
    expect(effortEstime(faits({ minutes: SEUIL_FACILE_MINUTES + 1 }))).toBe(
      'moyen',
    )
    expect(effortEstime(faits({ minutes: SEUIL_MOYEN_MINUTES }))).toBe('moyen')
  })

  it('appelle soutenu ce qui dépasse la journée', () => {
    expect(effortEstime(faits({ minutes: SEUIL_MOYEN_MINUTES + 1 }))).toBe(
      'soutenu',
    )
  })

  /** Les bornes sont des durées, et ces durées sont des journées de marche. */
  it('pose ses bornes sur des durées lisibles', () => {
    expect(SEUIL_FACILE_MINUTES).toBe(150)
    expect(SEUIL_MOYEN_MINUTES).toBe(300)
  })
})

/*
  Les durées de ces attentes viennent de `formatDuration`, relue avant de les
  écrire — et pas de ce que j'imaginais qu'elle rendait. Trois fois dans la
  même journée j'ai posé une attente sur une fonction de formatage sans la
  regarder (`formatOctets` et ses 1024, `formatKm` et sa décimale absente,
  `formatDuration` et son « 1 h 30 »), et trois fois c'est l'attente qui était
  fausse. Le motif est assez net pour être écrit ici.
*/
describe('libelleEffort', () => {
  it('qualifie, et dit que c’est estimé', () => {
    expect(libelleEffort(faits({ minutes: 90 }))).toBe(
      'Effort estimé : facile (1 h 30 à 4 km/h, D+ compris)',
    )
  })

  /**
   * Le cas qui décide de l'honnêteté du libellé : sans dénivelé publié,
   * l'estimation ne porte que sur la distance. Un sentier court et très
   * raide serait alors annoncé « facile » — le dire est la seule façon de ne
   * pas tromper.
   */
  it('avoue quand le dénivelé n’est pas publié', () => {
    expect(libelleEffort(faits({ minutes: 90, gainMeters: null }))).toBe(
      'Effort estimé : facile (1 h 30, sur la distance seule — dénivelé non publié)',
    )
  })

  /** Une durée publiée par la source vaut mieux que la nôtre, et se dit. */
  it('préfère la durée publiée, et l’attribue', () => {
    expect(
      libelleEffort(faits({ minutes: 240, minutesSource: 'published' })),
    ).toBe('Effort estimé : moyen (4 h annoncées par la source)')
  })

  /**
   * Le garde-fou : rien dans le libellé ne doit évoquer une cotation
   * officielle. Ni « niveau », ni « cotation », ni une couleur de piste.
   */
  it('ne se fait jamais passer pour une cotation', () => {
    for (const minutes of [30, 150, 200, 300, 600]) {
      const texte = libelleEffort(faits({ minutes }))
      expect(texte).toMatch(/estimé/)
      expect(texte).not.toMatch(/cotation|niveau|FFR|officiel/i)
    }
  })
})
