import { describe, it, expect } from 'vitest'
import { penteMaximale, libellePente } from '../../src/core/pente.ts'
import type { ElevationProfile } from '../../src/core/types.ts'

/**
 * Issue #179 — Farid, mobilité réduite, a besoin de connaître la pente
 * maximale avant de s'engager. Nadia et Yann, la même chose pour une
 * poussette.
 *
 * L'issue écrit la règle qui compte : « se tromper ici ne coûte pas une
 * déception : ça envoie quelqu'un en fauteuil ou avec une poussette sur un
 * sentier impraticable ». Tout ce fichier en découle — en particulier le
 * fait qu'on ne rend jamais un pourcentage nu.
 */
function profil(distances: number[], elevations: (number | null)[]): ElevationProfile {
  return {
    distances,
    elevations,
    coords: distances.map((): [number, number] => [4.5, 45.4]),
  }
}

describe('penteMaximale', () => {
  it('rend la plus forte montée', () => {
    // 50 m de montée sur 500 m de distance : 10 %.
    const p = penteMaximale(profil([0, 500, 1000], [100, 150, 155]))
    expect(p).not.toBeNull()
    expect(p!.pourcent).toBeCloseTo(10, 1)
  })

  it('compte une descente comme une pente', () => {
    // Une descente à 12 % n'est pas plus praticable qu'une montée à 12 %,
    // en fauteuil comme avec une poussette. C'est la pente qui compte, pas
    // le sens dans lequel on la prend.
    const p = penteMaximale(profil([0, 500], [160, 100]))
    expect(p!.pourcent).toBeCloseTo(12, 1)
  })

  it('dit sur quelle longueur la pente a été mesurée', () => {
    // Le chiffre sans sa résolution est un piège : 6 % moyennés sur 200 m
    // peuvent cacher une rampe à 20 % sur 30 m.
    const p = penteMaximale(profil([0, 200, 400], [100, 110, 112]))
    expect(p!.surMetres).toBe(200)
  })

  it('saute les trous d’altitude sans les traiter comme du plat', () => {
    // Le service d'altimétrie rend parfois null. Interpoler donnerait une
    // pente inventée ; compter zéro donnerait un plat qui n'existe pas.
    const p = penteMaximale(profil([0, 100, 200, 300], [100, null, null, 130]))
    expect(p).not.toBeNull()
    // Seul le segment 0 → 300 est mesurable : 30 m sur 300 m.
    expect(p!.pourcent).toBeCloseTo(10, 1)
    expect(p!.surMetres).toBe(300)
  })

  it('mesure la longueur, et non la somme des distances', () => {
    // Trouvé par les tests de mutation : remplacer `distance - precedent`
    // par `distance + precedent` laissait toute la suite au vert. Les
    // profils d'essai commençaient tous à zéro — où soustraire et
    // additionner donnent le même résultat — et leur pente la plus forte
    // était toujours sur le premier segment, celui qui part de zéro.
    //
    // Ici la plus forte pente est au milieu, et rien ne commence à zéro.
    const p = penteMaximale(
      profil([1000, 1200, 1400, 1600], [100, 100, 160, 165]),
    )
    // 60 m sur 200 m de longueur : 30 %. Une addition rendrait 60 sur
    // 2 600, soit 2,3 %.
    expect(p!.pourcent).toBeCloseTo(30, 1)
    expect(p!.surMetres).toBe(200)
  })

  it('garde la longueur du segment le plus raide en cas d’égalité', () => {
    // Trouvé par mutation : `>` remplacé par `>=` survivait. Deux pentes
    // égales sur des longueurs différentes ne rendaient pas la même
    // `surMetres`, et rien ne disait laquelle est la bonne. C'est la
    // première qui compte — la plus courte, donc la plus raide localement.
    const p = penteMaximale(profil([0, 100, 1100], [100, 110, 210]))
    expect(p!.pourcent).toBeCloseTo(10, 1)
    expect(p!.surMetres).toBe(100)
  })

  it('ne rend rien plutôt qu’un zéro trompeur', () => {
    expect(penteMaximale(profil([], []))).toBeNull()
    expect(penteMaximale(profil([0], [100]))).toBeNull()
    expect(penteMaximale(profil([0, 100], [null, null]))).toBeNull()
  })

  it('ignore deux points à la même distance', () => {
    // Diviser par zéro rendrait Infinity, et « pente maximale : Infinity % »
    // est le genre de chiffre qui détruit la confiance dans tout le reste.
    const p = penteMaximale(profil([0, 0, 100], [100, 120, 110]))
    expect(p!.pourcent).toBeCloseTo(10, 1)
    expect(Number.isFinite(p!.pourcent)).toBe(true)
  })
})

describe('libellePente', () => {
  it('nomme la résolution, jamais un pourcentage seul', () => {
    const texte = libellePente({ pourcent: 6.2, surMetres: 204 })
    expect(texte).toMatch(/6/)
    // La longueur arrondie à la dizaine, exactement. L'assertion disait
    // `/200|204/` : les tests de mutation ont montré qu'elle acceptait
    // « 2040 », c'est-à-dire un arrondi remplacé par une multiplication.
    // Une expression trop permissive est un test creux qui a l'air plein.
    expect(texte).toContain('200 m')
    expect(texte).not.toContain('2040')
  })

  it('dit que c’est une moyenne, pas un maximum instantané', () => {
    // Sans ce mot, quelqu'un lit « pente maximale 6 % » et comprend « nulle
    // part plus de 6 % ». C'est faux, et dangereux pour qui en dépend.
    const texte = libellePente({ pourcent: 6.2, surMetres: 204 })
    expect(texte).toMatch(/moyenn/i)
  })

  it('ne promet rien sur ce qui se passe entre deux points de mesure', () => {
    const texte = libellePente({ pourcent: 3, surMetres: 500 })
    expect(texte.length).toBeGreaterThan(30)
  })
})
