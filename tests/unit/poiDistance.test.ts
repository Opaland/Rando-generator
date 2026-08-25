import { describe, it, expect } from 'vitest'
import {
  situerPois,
  poisDuChemin,
  DETOUR_MAX_METRES,
  type PoiSitue,
} from '../../src/core/poiDistance.ts'
import type { LonLat, PoiKind, PointOfInterest } from '../../src/core/types.ts'

/**
 * Distance des points d'intérêt au tracé (issue #122).
 *
 * Les POI sont cherchés par boîtes englobantes, larges de plusieurs
 * kilomètres : « le long de l'itinéraire » ne veut rien dire tant qu'on n'a
 * pas mesuré. Un détour de vingt minutes et un détour d'une demi-journée ne
 * se décident pas pareil.
 */
const TRACE: LonLat[] = [
  [4.5, 45.4],
  [4.6, 45.4],
]

function poi(
  id: string,
  lon: number,
  lat: number,
  kind: PoiKind = 'water',
): PointOfInterest {
  return {
    id,
    lon,
    lat,
    kind,
    name: id,
    details: {
      phone: null,
      website: null,
      capacity: null,
      openingHours: null,
      operator: null,
      elevation: null,
      drinkingWater: null,
      seasonal: false,
      spring: false,
    },
  }
}

describe('situerPois', () => {
  it('mesure la distance au tracé, pas au point de départ', () => {
    // Au milieu du tracé, décalé de 0,001° au nord — soit ~111 m. Mesuré
    // depuis le départ, il serait à 4 km.
    const [situe] = situerPois([poi('source', 4.55, 45.401)], TRACE)
    expect(situe?.distanceMeters).toBeGreaterThan(100)
    expect(situe?.distanceMeters).toBeLessThan(120)
  })

  it('compte le détour comme un aller-retour', () => {
    // C'est ce que l'utilisateur veut savoir : ce que la source lui coûte,
    // pas où elle se trouve.
    const [situe] = situerPois([poi('source', 4.55, 45.401)], TRACE)
    expect(situe?.detourMeters).toBeCloseTo((situe?.distanceMeters ?? 0) * 2, 5)
  })

  it('rend zéro pour un point posé sur le tracé', () => {
    const [situe] = situerPois([poi('sur-place', 4.55, 45.4)], TRACE)
    expect(situe?.distanceMeters).toBeLessThan(1)
  })

  it('ne masque rien, même très loin du tracé', () => {
    // Un sommet à cinq kilomètres est un détour que certains feront : le
    // cacher déciderait à leur place. Le chiffre affiché, lui, laisse
    // trancher.
    const situes = situerPois(
      [poi('proche', 4.55, 45.401), poi('lointain', 4.55, 45.45)],
      TRACE,
    )
    expect(situes.map((s) => s.id)).toEqual(['proche', 'lointain'])
    expect(situes[1]?.detourMeters).toBeGreaterThan(10_000)
  })

  it('trie du plus proche au plus lointain', () => {
    const situes = situerPois(
      [
        poi('moyen', 4.55, 45.403),
        poi('tout-pres', 4.55, 45.4001),
        poi('loin', 4.55, 45.404),
      ],
      TRACE,
    )
    expect(situes.map((s) => s.id)).toEqual(['tout-pres', 'moyen', 'loin'])
  })

  it('mesure sur le segment, pas seulement sur les sommets', () => {
    // Un tracé décrit par deux points distants : un POI au milieu est proche
    // du chemin même s'il est loin des deux extrémités. C'est la différence
    // entre suivre un sentier et pointer ses bornes.
    const situes = situerPois([poi('milieu', 4.55, 45.4)], TRACE)
    expect(situes[0]?.distanceMeters).toBeLessThan(1)
  })

  it('rend une liste vide sans tracé exploitable', () => {
    expect(situerPois([poi('a', 4.5, 45.4)], [])).toEqual([])
    expect(situerPois([poi('a', 4.5, 45.4)], [[4.5, 45.4]])).toHaveLength(1)
  })

  it('conserve tout ce que le POI portait', () => {
    const [situe] = situerPois([poi('source', 4.55, 45.4)], TRACE)
    const complet: PoiSitue | undefined = situe
    expect(complet?.name).toBe('source')
    expect(complet?.kind).toBe('water')
  })
})


/**
 * Le rayon de détour (issue #318).
 *
 * Relevé par Cédric le 25/08 sur « Au cœur des Monts d'Or » : **quarante-quatre
 * points d'intérêt sur une boucle de 8,6 km, dont un à 4,2 km de détour**. Et
 * sur « Rando Saint-Joseph », 500 m de long : sept points, dont un à 3,4 km.
 *
 * La cause n'est pas un défaut de calcul : `situerPois` mesure juste. C'est
 * que rien n'écartait, par décision explicite — le module disait « un sommet
 * à deux kilomètres est un détour que certains feront », et il avait raison
 * pour un sommet. Il avait tort pour quarante-trois autres, parce qu'une
 * liste qu'on ne peut pas lire ne laisse personne décider de rien.
 *
 * Le rayon est tranché par Cédric : **1 km de détour**, sauf hébergement.
 */
describe('poisDuChemin', () => {
  const situer = (pois: PointOfInterest[]) => situerPois(pois, TRACE)

  it('garde ce qui est à portée, écarte ce qui ne l’est pas', () => {
    // 0,005° de latitude ≈ 556 m à l'écart du tracé, soit 1 112 m de détour :
    // juste au-delà. 0,004° ≈ 445 m, soit 890 m : juste en deçà.
    const situes = situer([
      poi('proche', 4.55, 45.404),
      poi('loin', 4.55, 45.405),
    ])
    const { retenus, ecartes } = poisDuChemin(situes)
    expect(retenus.map((p) => p.id)).toEqual(['proche'])
    expect(ecartes.map((p) => p.id)).toEqual(['loin'])
  })

  it('le rayon vaut un kilomètre de détour, et il est exporté', () => {
    // Tranché par Cédric le 25/08. Le test le fixe pour qu'on ne puisse pas
    // le déplacer en croyant ajuster un affichage : ce nombre change ce que
    // la fiche montre.
    expect(DETOUR_MAX_METRES).toBe(1_000)
  })

  it('la borne est incluse : un détour d’exactement un kilomètre est gardé', () => {
    const situes: PoiSitue[] = [
      {
        ...poi('pile', 4.55, 45.4),
        distanceMeters: DETOUR_MAX_METRES / 2,
        detourMeters: DETOUR_MAX_METRES,
      },
    ]
    expect(poisDuChemin(situes).retenus).toHaveLength(1)
  })

  it('un hébergement reste, si loin soit-il', () => {
    /*
      L'exception que Cédric a posée avec le rayon, et elle n'est pas une
      tolérance : un refuge à quatre kilomètres est une décision d'étape, pas
      un détour d'agrément. Le masquer ferait planifier une nuit dehors à
      quelqu'un qui avait un toit à une heure de marche.
    */
    const situes = situer([
      poi('refuge', 4.55, 45.44, 'hut'),
      poi('cabane', 4.55, 45.44, 'bivouac'),
      poi('gîte', 4.55, 45.44, 'gite'),
      poi('sommet', 4.55, 45.44, 'peak'),
    ])
    const { retenus, ecartes } = poisDuChemin(situes)
    expect(retenus.map((p) => p.id).sort()).toEqual([
      'cabane',
      'gîte',
      'refuge',
    ])
    expect(ecartes.map((p) => p.id)).toEqual(['sommet'])
  })

  it('un abri météo n’est pas un hébergement, et suit le rayon commun', () => {
    // `shelter` est une pause ou une urgence. L'exception porte sur ce où
    // l'on dort, pas sur ce qui a un toit.
    const situes = situer([poi('auvent', 4.55, 45.44, 'shelter')])
    expect(poisDuChemin(situes).retenus).toHaveLength(0)
  })

  it('n’écarte pas les points, il les met de côté', () => {
    /*
      La fiche doit pouvoir dire combien ont été retirés. Une liste tronquée
      en silence est un mensonge par omission — et c'est exactement ce que le
      commentaire d'origine de ce module refusait, à juste titre. Le rayon
      règle la lisibilité ; il ne doit pas coûter la franchise.
    */
    const situes = situer([
      poi('a', 4.55, 45.405),
      poi('b', 4.55, 45.41),
      poi('c', 4.55, 45.4),
    ])
    const { retenus, ecartes } = poisDuChemin(situes)
    expect(retenus.length + ecartes.length).toBe(situes.length)
  })

  it('garde l’ordre du plus proche au plus lointain, des deux côtés', () => {
    const situes = situer([
      poi('loin', 4.55, 45.42),
      poi('près', 4.55, 45.4),
      poi('moyen', 4.55, 45.412),
    ])
    const { retenus, ecartes } = poisDuChemin(situes)
    expect(retenus.map((p) => p.id)).toEqual(['près'])
    expect(ecartes.map((p) => p.id)).toEqual(['moyen', 'loin'])
  })
})
