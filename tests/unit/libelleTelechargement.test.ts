import { describe, it, expect } from 'vitest'
import {
  ZOOMS_TERRAIN,
  RAYON_CORRIDOR_METRES,
  libelleTelechargement,
} from '../../src/core/telechargement.ts'

/**
 * Les tailles passent par `formatOctets`, qui compte en 1024 depuis
 * `Backup.tsx` et `ZonePicker.tsx`. Les entrées de ce fichier sont donc
 * écrites avec ce multiplicateur, et non en octets ronds : une attente
 * posée à la main aurait dit « 2,4 Mo » là où la fonction dit « 2,3 » —
 * c'est l'attente qui aurait été fausse, et le test aurait fait croire à
 * un défaut d'affichage.
 */
const MO = 1024 * 1024

/**
 * Issue #153 — « avec le budget affiché avant de lancer ».
 *
 * L'issue demande des mégaoctets. Elle ne les aura pas avant de lancer, et
 * il faut dire pourquoi : **personne n'a mesuré ce que pèse une tuile de la
 * Géoplateforme.** Annoncer « environ 40 Mo » serait exactement le nombre
 * inventé que CLAUDE.md §2 interdit — un chiffre caché derrière un mot
 * rassurant, plus difficile à contester qu'un chiffre affiché.
 *
 * Ce qui est affiché à la place est **exact** : le nombre de tuiles avant,
 * les octets réellement reçus pendant et après. Le jour où la mesure
 * existera, l'estimation pourra s'ajouter ; d'ici là, on ne promet que ce
 * qu'on sait.
 */

describe('avant de lancer', () => {
  it('annonce le nombre de tuiles, qui est connu exactement', () => {
    expect(libelleTelechargement(null, 104)).toBe(
      'Emporter cette randonnée (104 tuiles)',
    )
  })

  it('se contente du verbe quand il n’y a rien à compter', () => {
    expect(libelleTelechargement(null, 0)).toBe('Emporter cette randonnée')
  })

  it('accorde le singulier', () => {
    expect(libelleTelechargement(null, 1)).toBe(
      'Emporter cette randonnée (1 tuile)',
    )
  })
})

describe('pendant', () => {
  it('dit où l’on en est, et ce qui est déjà descendu', () => {
    expect(
      libelleTelechargement(
        { faites: 37, total: 104, octets: 2.4 * MO, echecs: 0, fini: false },
        104,
      ),
    ).toBe('37 / 104 · 2,4 Mo')
  })

  it('reste lisible avant le premier octet', () => {
    expect(
      libelleTelechargement(
        { faites: 0, total: 104, octets: 0, echecs: 0, fini: false },
        104,
      ),
    ).toBe('0 / 104 · 0 o')
  })
})

describe('après', () => {
  it('dit ce que ça a pesé, une fois pour toutes', () => {
    expect(
      libelleTelechargement(
        { faites: 104, total: 104, octets: 6.1 * MO, echecs: 0, fini: true },
        104,
      ),
    ).toBe('Emportée · 6,1 Mo')
  })

  /**
   * Une randonnée à laquelle il manque trois tuiles reste emportée — mais
   * on ne le tait pas. Trois carrés gris en montagne valent mieux qu'une
   * surprise, et bien mieux qu'un « terminé » qui ne l'était pas.
   */
  it('ne cache pas ce qui n’est pas descendu', () => {
    expect(
      libelleTelechargement(
        { faites: 104, total: 104, octets: 5.9 * MO, echecs: 3, fini: true },
        104,
      ),
    ).toBe('Emportée · 5,9 Mo · 3 manquantes')
  })

  it('accorde le singulier', () => {
    expect(
      libelleTelechargement(
        { faites: 10, total: 10, octets: 1_000, echecs: 1, fini: true },
        10,
      ),
    ).toContain('1 manquante')
  })
})

describe('les réglages du corridor', () => {
  /**
   * Ces deux nombres décident de **ce qui est téléchargé**, pas de la façon
   * dont un résultat est présenté : ils tombent donc du mauvais côté de la
   * distinction de CLAUDE.md §2, et ils sont posés au jugement faute de
   * mieux. Ce qui est exigible, c'est qu'ils soient écrits, justifiés, et
   * qu'on sache ce qu'ils coûtent — mesuré : 104 tuiles pour 2,3 km de GR.
   */
  it('couvre les zooms où l’on lit un sentier, et pas au-delà', () => {
    expect(ZOOMS_TERRAIN).toEqual([12, 13, 14, 15, 16])
  })

  it('garde un corridor d’un demi-kilomètre de part et d’autre', () => {
    expect(RAYON_CORRIDOR_METRES).toBe(500)
  })
})
