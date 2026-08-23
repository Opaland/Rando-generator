import { describe, it, expect } from 'vitest'
import {
  TAILLE_TUILE_PX,
  cleTuile,
  metresParPixel,
  tuileDe,
  tuilesDuCorridor,
  urlDeTuile,
} from '../../src/core/corridor.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #153 — télécharger une randonnée pour le terrain.
 *
 * Le cache de tuiles est aujourd'hui alimenté par ce qu'on a **déjà
 * regardé** : préparer sa sortie la veille en zoomant dessus ne garantit
 * rien au départ le lendemain. Ce module dit quelles tuiles couvrent le
 * corridor d'un itinéraire — le calcul, pas le téléchargement.
 *
 * Tout y est vérifiable sans réseau, et ce n'est pas un hasard : c'est la
 * moitié du problème qui se casse en silence. Une tuile oubliée ne se voit
 * qu'en montagne, sans réseau, au moment où l'on en a besoin.
 */

/** Le GR 7 de la fixture, en gros : une ligne est-ouest dans le Pilat. */
function ligne(nbPoints: number, pasDegres: number): LonLat[] {
  return Array.from(
    { length: nbPoints },
    (_, i): LonLat => [4.5 + i * pasDegres, 45.4],
  )
}

describe('la tuile qui contient un point', () => {
  /**
   * Repères connus de la projection Web Mercator, vérifiables à la main :
   * au zoom 0 le monde tient dans une tuile, et le méridien de Greenwich à
   * l'équateur tombe au coin des quatre tuiles centrales.
   */
  it('place le monde entier dans une seule tuile au zoom 0', () => {
    expect(tuileDe(0, 0, 0)).toEqual({ z: 0, x: 0, y: 0 })
    expect(tuileDe(-179, 85, 0)).toEqual({ z: 0, x: 0, y: 0 })
    expect(tuileDe(179, -85, 0)).toEqual({ z: 0, x: 0, y: 0 })
  })

  it('coupe le monde en quatre au zoom 1', () => {
    expect(tuileDe(-90, 45, 1)).toEqual({ z: 1, x: 0, y: 0 })
    expect(tuileDe(90, 45, 1)).toEqual({ z: 1, x: 1, y: 0 })
    expect(tuileDe(-90, -45, 1)).toEqual({ z: 1, x: 0, y: 1 })
    expect(tuileDe(90, -45, 1)).toEqual({ z: 1, x: 1, y: 1 })
  })

  /**
   * Un repère réel : le Pilat, zoom 12. Vérifié à la main plutôt que
   * recopié de la sortie du code — c'est tout l'objet d'un test de
   * référence. x = ((4,5 + 180) / 360) × 4096 = 2099,2 ; pour y, la
   * projection donne 0,3581 × 4096 = 1466,8.
   */
  it('rend la tuile attendue pour un point connu', () => {
    expect(tuileDe(4.5, 45.4, 12)).toEqual({ z: 12, x: 2099, y: 1466 })
  })

  it('reste dans le monde même pour un point aux bords', () => {
    const t = tuileDe(180, 89, 4)
    expect(t.x).toBeLessThanOrEqual(15)
    expect(t.y).toBeGreaterThanOrEqual(0)
    expect(t.y).toBeLessThanOrEqual(15)
  })
})

describe('la taille d’une tuile sur le terrain', () => {
  /**
   * La résolution de Web Mercator à l'équateur est un nombre connu :
   * 156 543,03 m/px au zoom 0, divisé par deux à chaque zoom. À 45° de
   * latitude, elle est réduite par le cosinus.
   */
  it('suit la formule de Web Mercator, latitude comprise', () => {
    expect(metresParPixel(0, 0)).toBeCloseTo(156_543.03, 0)
    expect(metresParPixel(0, 1)).toBeCloseTo(78_271.5, 0)
    expect(metresParPixel(45, 12)).toBeCloseTo(
      (156_543.03 * Math.cos((45 * Math.PI) / 180)) / 2 ** 12,
      2,
    )
  })

  it('donne une tuile d’environ 430 m de côté au zoom 16 sous nos latitudes', () => {
    // Mesuré : 429 m à 45,4° N. C'est ce nombre qui décide de la largeur
    // du corridor en tuiles — un rayon de 500 m déborde donc d'une tuile
    // de chaque côté à ce zoom-là, et d'aucune au zoom 15 (859 m).
    const cote = metresParPixel(45.4, 16) * TAILLE_TUILE_PX
    expect(cote).toBeCloseTo(429, 0)
  })
})

describe('le corridor', () => {
  it('ne rend rien pour un itinéraire sans géométrie', () => {
    expect(tuilesDuCorridor([], { zooms: [14], rayonMetres: 500 })).toEqual([])
  })

  it('couvre le point de départ et le point d’arrivée', () => {
    const trace = ligne(2, 0.01)
    const tuiles = tuilesDuCorridor(trace, { zooms: [14], rayonMetres: 0 })
    const clefs = new Set(tuiles.map(cleTuile))
    expect(clefs.has(cleTuile(tuileDe(4.5, 45.4, 14)))).toBe(true)
    expect(clefs.has(cleTuile(tuileDe(4.51, 45.4, 14)))).toBe(true)
  })

  /**
   * **Le défaut qui ne se voit qu'en montagne.** Deux points d'un tracé
   * peuvent être distants de plusieurs kilomètres — une trace OSM n'a pas
   * de pas régulier. Ne prendre que les tuiles des sommets laisserait des
   * trous au milieu des segments, et le trou serait précisément là où l'on
   * marche.
   */
  it('ne laisse pas de trou au milieu d’un long segment', () => {
    const depart: LonLat = [4.5, 45.4]
    const arrivee: LonLat = [4.6, 45.4]
    expect(distanceMeters(depart, arrivee)).toBeGreaterThan(7_000)

    const tuiles = tuilesDuCorridor([depart, arrivee], {
      zooms: [15],
      rayonMetres: 0,
    })
    const clefs = new Set(tuiles.map(cleTuile))
    const milieu = tuileDe(4.55, 45.4, 15)
    expect(clefs.has(cleTuile(milieu))).toBe(true)

    // Et la colonne de tuiles est continue : aucun x manquant.
    const xs = [...new Set(tuiles.map((t) => t.x))].sort((a, b) => a - b)
    const attendus = Array.from(
      { length: (xs.at(-1) ?? 0) - (xs[0] ?? 0) + 1 },
      (_, i) => (xs[0] ?? 0) + i,
    )
    expect(xs).toEqual(attendus)
  })

  it('élargit le corridor quand on le demande', () => {
    const trace = ligne(2, 0.001)
    const serre = tuilesDuCorridor(trace, { zooms: [15], rayonMetres: 0 })
    const large = tuilesDuCorridor(trace, { zooms: [15], rayonMetres: 2_000 })
    expect(large.length).toBeGreaterThan(serre.length)
  })

  it('ne rend jamais deux fois la même tuile', () => {
    // Cent points dans la même tuile : une seule doit sortir.
    const surPlace = Array.from(
      { length: 100 },
      (_, i) => [4.5 + i * 0.000_001, 45.4] as LonLat,
    )
    const tuiles = tuilesDuCorridor(surPlace, {
      zooms: [12],
      rayonMetres: 0,
    })
    expect(tuiles).toHaveLength(1)
  })

  it('rend un lot par zoom demandé, et rien pour les autres', () => {
    const tuiles = tuilesDuCorridor(ligne(3, 0.01), {
      zooms: [12, 13],
      rayonMetres: 0,
    })
    expect(new Set(tuiles.map((t) => t.z))).toEqual(new Set([12, 13]))
  })

  /**
   * Le compte est ce qu'on montrera avant de lancer : il doit être stable
   * d'un appel à l'autre, sans quoi le chiffre annoncé et le
   * téléchargement réel ne parleraient pas de la même chose.
   */
  it('rend le même résultat à chaque appel', () => {
    const options = { zooms: [13, 14], rayonMetres: 800 }
    const a = tuilesDuCorridor(ligne(20, 0.005), options)
    const b = tuilesDuCorridor(ligne(20, 0.005), options)
    expect(a).toEqual(b)
  })

  /**
   * Le côté d'une tuile est divisé par deux à chaque zoom : le nombre de
   * colonnes que traverse un tracé doit donc doubler.
   *
   * La première version de ce test affirmait « quatre fois plus de tuiles
   * par trois zooms », un rapport deviné — et faux, parce que le corridor
   * ne s'élargit pas en même temps : à 500 m de rayon, la marge vaut une
   * tuile du zoom 12 au zoom 15. C'est la raison qu'on garde ici, pas un
   * nombre.
   */
  it('double le nombre de colonnes à chaque zoom', () => {
    const trace = ligne(10, 0.01)
    const colonnes = (z: number) => {
      const xs = tuilesDuCorridor(trace, { zooms: [z], rayonMetres: 0 }).map(
        (t) => t.x,
      )
      return Math.max(...xs) - Math.min(...xs) + 1
    }
    for (const z of [12, 13, 14, 15]) {
      // Doubler une plage d'entiers peut perdre un pas d'alignement aux
      // bords : d'où le « au moins 2n − 1 ».
      expect(colonnes(z + 1)).toBeGreaterThanOrEqual(2 * colonnes(z) - 1)
    }
  })
})

describe('les bords du monde', () => {
  /**
   * Un corridor tout au bord de la carte déborde du monde. Les tuiles
   * inexistantes ne sont pas demandées — une requête pour `x = 4096` au
   * zoom 12 rendrait une erreur, et une erreur pendant un téléchargement
   * qu'on a lancé exprès avant de partir est le pire moment pour en avoir
   * une.
   */
  it('ne demande pas de tuile hors du monde', () => {
    const tuiles = tuilesDuCorridor([[179.999, 45.4]], {
      zooms: [4],
      rayonMetres: 400_000,
    })
    expect(tuiles.length).toBeGreaterThan(0)
    for (const t of tuiles) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.x).toBeLessThan(2 ** 4)
      expect(t.y).toBeGreaterThanOrEqual(0)
      expect(t.y).toBeLessThan(2 ** 4)
    }
  })

  /**
   * **Ce test a trouvé une boucle sans fin, avant la livraison.**
   *
   * Au pôle, `Math.cos(π/2)` ne vaut pas zéro mais 6,1 × 10⁻¹⁷ : une tuile
   * y mesure 3 × 10⁻¹³ m de côté. Le garde `cote > 0` laissait donc passer,
   * et la marge calculée valait trois millions de milliards de tuiles. La
   * première exécution de ce test a tourné dix minutes avant que je
   * l'arrête.
   *
   * Personne ne randonne au pôle. Mais une trace abîmée peut y mener, et une
   * application figée est une mauvaise façon de l'apprendre.
   */
  it('ne boucle pas sur un point au pôle', () => {
    const debut = performance.now()
    const tuiles = tuilesDuCorridor(
      [
        [0, 90],
        [1, 90],
      ],
      { zooms: [3], rayonMetres: 1_000 },
    )
    expect(performance.now() - debut).toBeLessThan(1_000)
    expect(tuiles.length).toBeGreaterThan(0)
    // Le monde entier au zoom 3 fait 64 tuiles : on ne peut pas en rendre plus.
    expect(tuiles.length).toBeLessThanOrEqual(64)
  })

  it('ne rend jamais plus de tuiles qu’il n’y en a dans le monde', () => {
    expect(
      tuilesDuCorridor([[0, 0]], { zooms: [2], rayonMetres: 40_000_000 }),
    ).toHaveLength(4 * 4)
  })
})

describe('l’adresse d’une tuile', () => {
  it('remplit le gabarit de la Géoplateforme', () => {
    const url = urlDeTuile(
      { z: 12, x: 2099, y: 1470 },
      'https://exemple/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    )
    expect(url).toBe('https://exemple/wmts?TILEMATRIX=12&TILEROW=1470&TILECOL=2099')
  })

  it('remplit le gabarit d’OpenStreetMap', () => {
    expect(
      urlDeTuile({ z: 12, x: 2099, y: 1470 }, 'https://t/{z}/{x}/{y}.png'),
    ).toBe('https://t/12/2099/1470.png')
  })
})
