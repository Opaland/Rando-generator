import { describe, it, expect } from 'vitest'
import {
  penteMaximale,
  libellePente,
  PAS_MINIMAL_METRES,
} from '../../src/core/pente.ts'
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

/** La pente d'un profil dont on affirme qu'elle est mesurable. */
function mesuree(p: ElevationProfile) {
  const mesure = penteMaximale(p)
  if (mesure.etat !== 'mesuree') {
    throw new Error(`attendu : une pente mesurée, obtenu « ${mesure.etat} »`)
  }
  return mesure.pente
}

describe('penteMaximale', () => {
  it('rend la plus forte montée', () => {
    // 50 m de montée sur 500 m de distance : 10 %.
    const p = mesuree(profil([0, 500, 1000], [100, 150, 155]))
    expect(p.pourcent).toBeCloseTo(10, 1)
  })

  it('compte une descente comme une pente', () => {
    // Une descente à 12 % n'est pas plus praticable qu'une montée à 12 %,
    // en fauteuil comme avec une poussette. C'est la pente qui compte, pas
    // le sens dans lequel on la prend.
    const p = mesuree(profil([0, 500], [160, 100]))
    expect(p.pourcent).toBeCloseTo(12, 1)
  })

  it('dit sur quelle longueur la pente a été mesurée', () => {
    // Le chiffre sans sa résolution est un piège : 6 % moyennés sur 200 m
    // peuvent cacher une rampe à 20 % sur 30 m.
    const p = mesuree(profil([0, 200, 400], [100, 110, 112]))
    expect(p.surMetres).toBe(200)
  })

  it('saute les trous d’altitude sans les traiter comme du plat', () => {
    // Le service d'altimétrie rend parfois null. Interpoler donnerait une
    // pente inventée ; compter zéro donnerait un plat qui n'existe pas.
    const p = mesuree(profil([0, 100, 200, 300], [100, null, null, 130]))
    // Seul le segment 0 → 300 est mesurable : 30 m sur 300 m.
    expect(p.pourcent).toBeCloseTo(10, 1)
    expect(p.surMetres).toBe(300)
  })

  it('mesure la longueur, et non la somme des distances', () => {
    // Trouvé par les tests de mutation : remplacer `distance - precedent`
    // par `distance + precedent` laissait toute la suite au vert. Les
    // profils d'essai commençaient tous à zéro — où soustraire et
    // additionner donnent le même résultat — et leur pente la plus forte
    // était toujours sur le premier segment, celui qui part de zéro.
    //
    // Ici la plus forte pente est au milieu, et rien ne commence à zéro.
    const p = mesuree(profil([1000, 1200, 1400, 1600], [100, 100, 160, 165]))
    // 60 m sur 200 m de longueur : 30 %. Une addition rendrait 60 sur
    // 2 600, soit 2,3 %.
    expect(p.pourcent).toBeCloseTo(30, 1)
    expect(p.surMetres).toBe(200)
  })

  it('garde la longueur du segment le plus raide en cas d’égalité', () => {
    // Trouvé par mutation : `>` remplacé par `>=` survivait. Deux pentes
    // égales sur des longueurs différentes ne rendaient pas la même
    // `surMetres`, et rien ne disait laquelle est la bonne. C'est la
    // première qui compte — la plus courte, donc la plus raide localement.
    const p = mesuree(profil([0, 100, 1100], [100, 110, 210]))
    expect(p.pourcent).toBeCloseTo(10, 1)
    expect(p.surMetres).toBe(100)
  })

  it('ne rend rien plutôt qu’un zéro trompeur', () => {
    expect(penteMaximale(profil([], [])).etat).toBe('sans-altitude')
    expect(penteMaximale(profil([0], [100])).etat).toBe('sans-altitude')
    expect(penteMaximale(profil([0, 100], [null, null])).etat).toBe(
      'sans-altitude',
    )
  })

  describe('sous la résolution du modèle altimétrique (issue #316)', () => {
    /*
      Relevé par Cédric le 25/08 sur deux fiches, à une heure d'intervalle :

          Pente : jusqu'à 822 % en moyenne sur 0 m
          Pente : jusqu'à 79,9 % en moyenne sur 0 m   (« Rando Saint-Joseph »)

      822 %, c'est une falaise à 83°. Et la phrase se réfute elle-même : une
      moyenne *sur zéro mètre* n'est la moyenne de rien.

      La garde d'avant protégeait de `Infinity` — division par exactement
      zéro — et le faisait. Elle ne protégeait pas de la division par un
      nombre **presque** nul, qui est le cas fréquent : deux nœuds OSM
      distants de quarante centimètres sur une courbe serrée, et un pas de
      trois mètres rendu par le service altimétrique.
    */
    it('ne mesure pas une pente sous le pas du modèle', () => {
      // 3 m de dénivelé sur 40 cm : 750 %. C'est le bruit du modèle, pas le
      // terrain.
      const mesure = penteMaximale(profil([0, 0.4, 400], [100, 103, 110]))
      expect(mesure.etat).toBe('mesuree')
      if (mesure.etat !== 'mesuree') return
      // La pente retenue est celle du segment long : 7 m sur 399,6 m.
      expect(mesure.pente.pourcent).toBeCloseTo(1.75, 1)
      expect(mesure.pente.surMetres).toBeGreaterThanOrEqual(PAS_MINIMAL_METRES)
    })

    it('le pas minimal est celui qu’annonce le service, et il est exporté', () => {
      // Emprunté, pas inventé (§2) : c'est le pas du MNT que la Géoplateforme
      // sert sous `ign_rge_alti_wld`. Le test le fixe pour qu'on ne puisse
      // pas le changer par inadvertance en croyant ajuster un affichage.
      expect(PAS_MINIMAL_METRES).toBe(5)
    })

    it('un segment qui atteint exactement le pas minimal est mesuré', () => {
      // La borne est incluse : à 5 m, le modèle a un point de chaque côté.
      const mesure = penteMaximale(profil([0, 5], [100, 100.5]))
      expect(mesure.etat).toBe('mesuree')
      if (mesure.etat !== 'mesuree') return
      expect(mesure.pente.surMetres).toBe(5)
      expect(mesure.pente.pourcent).toBeCloseTo(10, 1)
    })

    it('quand aucun segment n’atteint le pas, la fiche le dit au lieu de se taire', () => {
      /*
        Taire perdrait une information : quelqu'un qui cherche la pente
        conclurait « pas de pente », alors que la vérité est « pas mesurable
        ici ». C'est la moitié du §2 qui se décide plutôt que se mesure, et
        elle est tranchée ici : dire.
      */
      const mesure = penteMaximale(profil([0, 0.4, 0.9], [100, 103, 104]))
      expect(mesure.etat).toBe('trop-fine')
      if (mesure.etat !== 'trop-fine') return
      // Le plus long segment vu, pour que la phrase puisse être concrète.
      expect(mesure.pasLePlusLong).toBeCloseTo(0.5, 2)

      const texte = libellePente(mesure)
      expect(texte).not.toBeNull()
      expect(texte!).toMatch(/pas mesurable|ne se mesure pas/i)
      // Et surtout : aucun pourcentage. C'est tout l'objet de l'issue.
      expect(texte!).not.toMatch(/\d\s*%/)
    })

    it('ne dit rien du tout quand il n’y a pas d’altitude', () => {
      // « Pas mesurable à cette résolution » serait faux : ce n'est pas la
      // résolution qui manque, c'est la donnée.
      expect(libellePente({ etat: 'sans-altitude' })).toBeNull()
    })

    it('n’écrit plus « sur 0 m » pour un segment court mais mesurable', () => {
      // L'arrondi à la dizaine rendait « 0 m » pour tout segment sous 5 m —
      // et il rendrait encore « 0 m » à 5 m, juste au-dessus du plancher.
      // Sous cent mètres, le mètre est la bonne unité.
      const texte = libelle({ pourcent: 12, surMetres: 6 })
      expect(texte).toContain('6 m')
      expect(texte).not.toContain('0 m')
    })
  })

  it('écarte un NaN comme il écarte un trou', () => {
    // `typeof NaN === 'number'` : la première garde le laisse passer, et
    // c'est la seconde qui l'arrête. Sans elle, une pente NaN gagnerait
    // toutes les comparaisons `>` ? Non — elle les perdrait toutes, et la
    // pente maximale serait silencieusement sous-estimée. Les deux façons
    // de se tromper sont mauvaises ; ce test tient la ligne qui l'évite.
    const p = mesuree(profil([0, 100, 200], [100, Number.NaN, 130]))
    // Seul le segment 0 → 200 subsiste : 30 m sur 200 m.
    expect(p.pourcent).toBeCloseTo(15, 1)
    expect(p.surMetres).toBe(200)
  })

  it('ignore deux points à la même distance', () => {
    // Diviser par zéro rendrait Infinity, et « pente maximale : Infinity % »
    // est le genre de chiffre qui détruit la confiance dans tout le reste.
    const p = mesuree(profil([0, 0, 100], [100, 120, 110]))
    expect(p.pourcent).toBeCloseTo(10, 1)
    expect(Number.isFinite(p.pourcent)).toBe(true)
  })
})

/** Le libellé d'une pente mesurée, sans avoir à écrire l'enveloppe. */
function libelle(pente: { pourcent: number; surMetres: number }): string {
  const texte = libellePente({ etat: 'mesuree', pente })
  if (texte === null) throw new Error('attendu : une phrase')
  return texte
}

describe('libellePente', () => {
  it('nomme la résolution, jamais un pourcentage seul', () => {
    const texte = libelle({ pourcent: 6.2, surMetres: 204 })
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
    const texte = libelle({ pourcent: 6.2, surMetres: 204 })
    expect(texte).toMatch(/moyenn/i)
  })

  it('ne promet rien sur ce qui se passe entre deux points de mesure', () => {
    const texte = libelle({ pourcent: 3, surMetres: 500 })
    expect(texte.length).toBeGreaterThan(30)
  })
})
