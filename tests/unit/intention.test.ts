import { describe, it, expect } from 'vitest'
import { lireIntention } from '../../src/core/intention.ts'
import {
  SEUIL_FACILE_MINUTES,
  SEUIL_MOYEN_MINUTES,
} from '../../src/core/discovery.ts'

/**
 * Pierre 0 de `docs/IA_LOCALE.md` — lire une question en toutes lettres.
 *
 * Ces tests portent une exigence de plus que d'habitude : **chacun vérifie
 * aussi ce qui n'a pas été compris**. Un lecteur de langage naturel qui ne
 * dit pas ce qu'il a ignoré est un lecteur qui ment par omission, et c'est
 * précisément le défaut qu'une IA de randonnée fait payer sur un sentier.
 */
describe('lireIntention — les distances', () => {
  it('lit une borne haute', () => {
    const i = lireIntention('une rando de moins de 10 km')
    expect(i.filtres.maxKm).toBe(10)
    expect(i.filtres.minKm).toBeNull()
  })

  it('lit une borne basse', () => {
    expect(lireIntention('au moins 5 km').filtres.minKm).toBe(5)
    expect(lireIntention('plus de 5 km').filtres.minKm).toBe(5)
  })

  it('lit un intervalle', () => {
    const i = lireIntention('entre 8 et 12 km')
    expect(i.filtres.minKm).toBe(8)
    expect(i.filtres.maxKm).toBe(12)
  })

  it('accepte la virgule décimale, comme on l’écrit en français', () => {
    expect(lireIntention('moins de 7,5 km').filtres.maxKm).toBe(7.5)
  })

  it('lit une distance nue comme une borne haute, et le dit', () => {
    /*
      « une rando de 10 km » n'exprime pas de direction. Les filtres n'offrent
      qu'un maximum et un minimum : la seule lecture *exprimable* est « au
      plus ». Ce n'est pas un seuil inventé — c'est la borne que la personne
      a écrite — mais c'est un choix de sens, et il doit se voir dans
      `compris` plutôt que se deviner.
    */
    const i = lireIntention('une rando de 10 km')
    expect(i.filtres.maxKm).toBe(10)
    expect(i.compris.map((f) => f.champ)).toContain('maxKm')
  })
})

describe('lireIntention — le dénivelé', () => {
  it('lit un dénivelé nommé', () => {
    expect(lireIntention('moins de 300 m de dénivelé').filtres.maxGain).toBe(
      300,
    )
    expect(lireIntention('pas plus de 300 m de D+').filtres.maxGain).toBe(300)
  })

  it('lit aussi le dénivelé écrit à l’envers', () => {
    // « dénivelé de 300 m » autant que « 300 m de dénivelé » : les deux
    // s'écrivent, et une règle qui n'en connaît qu'une renverrait l'autre
    // dans l'incompris en ayant l'air de fonctionner.
    const i = lireIntention('un dénivelé de moins de 300 m')
    expect(i.filtres.maxGain).toBe(300)
    expect(i.incompris).toEqual([])
  })

  it('ne prend pas des mètres de distance pour du dénivelé', () => {
    // Sans le mot « dénivelé » ou « D+ », des mètres restent des mètres.
    const i = lireIntention('un truc de 300 m')
    expect(i.filtres.maxGain).toBeNull()
  })
})

describe('lireIntention — la durée', () => {
  it('lit les heures et les minutes', () => {
    expect(lireIntention('moins de 2 h').filtres.maxMinutes).toBe(120)
    expect(lireIntention('2h30 maximum').filtres.maxMinutes).toBe(150)
    expect(lireIntention('90 min').filtres.maxMinutes).toBe(90)
  })

  it('emprunte les seuils d’effort déjà décidés, sans en inventer', () => {
    /*
      « Facile » ne veut rien dire de neuf : il veut dire ce que la liste
      appelle déjà facile. Réinventer un nombre ici créerait deux définitions
      du même mot dans la même application — le §4ter, en plus discret.
    */
    expect(lireIntention('une rando facile').filtres.maxMinutes).toBe(
      SEUIL_FACILE_MINUTES,
    )
    expect(lireIntention('difficulté moyenne').filtres.maxMinutes).toBe(
      SEUIL_MOYEN_MINUTES,
    )
  })
})

describe('lireIntention — la forme et le sol', () => {
  it('reconnaît une boucle et un aller simple', () => {
    expect(lireIntention('une boucle').filtres.shape).toBe('loop')
    expect(lireIntention('un aller simple').filtres.shape).toBe('linear')
    expect(lireIntention('une traversée').filtres.shape).toBe('linear')
  })

  it('reconnaît ce qui roule, par ce qui roule dessus', () => {
    expect(lireIntention('avec une poussette').filtres.sol).toBe('roulant')
    expect(lireIntention('en fauteuil').filtres.sol).toBe('roulant')
  })

  it('refuse « accessible », qui ne dit pas ce qu’il y a sous les roues', () => {
    /*
      Nadia s'est méfiée du pictogramme « accessible » parce qu'il l'a déjà
      envoyée sur un sentier qu'elle n'a pas pu faire. Le mot ne désigne pas
      un revêtement : le traduire en `sol: roulant` serait exactement la
      promesse fausse que `discovery.ts` refuse de faire.
    */
    const i = lireIntention('un chemin accessible')
    expect(i.filtres.sol).toBe('all')
    expect(i.incompris.join(' ')).toContain('accessible')
  })
})

describe('lireIntention — la proximité', () => {
  it('distingue « à 20 km de chez moi » de « une rando de 20 km »', () => {
    const proche = lireIntention('à moins de 20 km de chez moi')
    expect(proche.filtres.maxAwayKm).toBe(20)
    expect(proche.filtres.maxKm).toBeNull()

    const longue = lireIntention('une rando de moins de 20 km')
    expect(longue.filtres.maxKm).toBe(20)
    expect(longue.filtres.maxAwayKm).toBeNull()
  })
})

describe('lireIntention — ce qu’elle n’a pas compris', () => {
  it('rend les mots restants plutôt que de les avaler', () => {
    const i = lireIntention('une boucle de moins de 10 km avec des chèvres')
    expect(i.filtres.shape).toBe('loop')
    expect(i.filtres.maxKm).toBe(10)
    expect(i.incompris.join(' ')).toContain('chèvres')
  })

  it('ne garde pas les mots de liaison dans l’incompris', () => {
    // « une », « de », « avec » ne sont pas des demandes ignorées : les
    // rendre ferait passer un lecteur qui a tout compris pour un lecteur
    // perdu, et personne ne relirait plus la liste.
    const i = lireIntention('une boucle de moins de 10 km')
    expect(i.incompris).toEqual([])
  })

  it('sur une question vide, ne comprend rien et ne filtre rien', () => {
    const i = lireIntention('   ')
    expect(i.compris).toEqual([])
    expect(i.incompris).toEqual([])
    expect(i.filtres.maxKm).toBeNull()
    expect(i.filtres.shape).toBe('all')
  })

  it('n’invente pas un filtre sur une question qui n’en contient aucun', () => {
    const i = lireIntention('où est-ce qu’on mange bien dans le coin ?')
    expect(i.compris).toEqual([])
    expect(i.incompris.length).toBeGreaterThan(0)
  })
})

describe('lireIntention — la question entière', () => {
  it('lit une phrase de randonneur', () => {
    const i = lireIntention(
      'une boucle facile de moins de 12 km, pas plus de 400 m de dénivelé, à 30 km de chez moi',
    )
    expect(i.filtres.shape).toBe('loop')
    expect(i.filtres.maxMinutes).toBe(SEUIL_FACILE_MINUTES)
    expect(i.filtres.maxKm).toBe(12)
    expect(i.filtres.maxGain).toBe(400)
    expect(i.filtres.maxAwayKm).toBe(30)
    expect(i.incompris).toEqual([])
  })
})
