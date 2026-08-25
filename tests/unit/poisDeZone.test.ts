import { describe, it, expect } from 'vitest'
import {
  CATEGORIES_RECHERCHEES,
  DETOURS_PROPOSES,
  RAYON_DE_RECHERCHE_METERS,
  detoursParItineraire,
  type DetoursPoi,
} from '../../src/core/poisDeZone.ts'
import { DETOUR_MAX_METRES } from '../../src/core/poiDistance.ts'
import type { Itinerary, LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Ce qu'il y a sur le chemin, pour **choisir** (issue #156).
 *
 * Les POI sont téléchargés, classés et affichés dans la fiche depuis des
 * semaines. Ils n'ont jamais servi à choisir un itinéraire — seulement à le
 * décrire une fois choisi. « Y a-t-il de l'eau ? » est pourtant la question
 * qu'on se pose en juillet, et la seule information vitale de la liste.
 *
 * **Ce module rend une distance, jamais un booléen.** L'issue demande un
 * filtre « avec de l'eau » ; un booléen serait une promesse, et la promesse
 * est exactement ce qu'elle interdit — un POI absent d'OpenStreetMap ne veut
 * pas dire qu'il n'y a pas d'eau. Une distance dit ce qu'on a trouvé et où,
 * et laisse la personne décider. Le palier, lui, est choisi par elle dans la
 * liste, comme pour la longueur ou la durée : aucun seuil n'est inventé ici
 * (CLAUDE.md §2).
 */

const LAT = 45.4

function itin(id: number, lonDebut: number, lonFin: number): Itinerary {
  const coords: LonLat[] = []
  for (let lon = lonDebut; lon <= lonFin + 1e-9; lon += 0.001) {
    coords.push([Number(lon.toFixed(6)), LAT])
  }
  return {
    osmRelationId: id,
    ref: `GR ${id}`,
    name: null,
    network: 'GR',
    ways: [{ osmWayId: id * 10, coords }],
    totalMeters: 1_000,
    fetchedAt: '2026-08-25T00:00:00Z',
  }
}

function poi(id: string, kind: PointOfInterest['kind'], lon: number, lat: number): PointOfInterest {
  return {
    id,
    lon,
    lat,
    kind,
    name: null,
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

describe('detoursParItineraire (#156)', () => {
  it('rend le détour du plus proche de chaque catégorie', () => {
    const itineraires = [itin(1, 4.5, 4.51)]
    // 1e-4 ° de latitude ≈ 11,1 m ; le détour est un aller-retour.
    const pois = [
      poi('node/1', 'water', 4.505, LAT + 0.0001),
      poi('node/2', 'water', 4.507, LAT + 0.001),
      poi('node/3', 'viewpoint', 4.508, LAT + 0.0005),
    ]
    const [detours] = detoursParItineraire(itineraires, pois)
    expect(detours?.water).toBeGreaterThan(0)
    expect(detours?.water).toBeLessThan(50)
    expect(detours?.viewpoint).toBeGreaterThan(50)
  })

  /**
   * `null` et non `Infinity` : la nuance est tout le sujet de l'issue. On n'a
   * **rien trouvé**, ce qui n'est pas la même chose que « c'est loin ». La
   * liste devra l'écrire ainsi.
   */
  it('rend null quand rien n’a été trouvé pour une catégorie', () => {
    const [detours] = detoursParItineraire(
      [itin(1, 4.5, 4.51)],
      [poi('node/1', 'water', 4.505, LAT)],
    )
    expect(detours?.water).not.toBeNull()
    expect(
      detours?.shelter,
      'aucun abri trouvé ne doit pas se confondre avec un abri très loin',
    ).toBeNull()
  })

  it('n’attribue pas à un itinéraire un POI qui longe l’autre', () => {
    const loin = 1
    const resultats = detoursParItineraire(
      [itin(1, 4.5, 4.51), itin(2, 4.5 + loin, 4.51 + loin)],
      [poi('node/1', 'water', 4.505, LAT)],
    )
    expect(resultats[0]?.water).toBeLessThan(50)
    expect(resultats[1]?.water).toBeNull()
  })

  it('ne retient que les catégories qui aident à choisir', () => {
    expect([...CATEGORIES_RECHERCHEES]).toEqual(['water', 'shelter', 'viewpoint'])
  })

  /**
   * Le garde-fou du seuil caché.
   *
   * La première version laissait le rayon de recherche vivre implicitement
   * dans la taille des cellules d'index, avec un commentaire affirmant que
   * seule la vitesse en dépendait. C'était faux : le rayon décide **quand on
   * rend `null`**, donc quand la liste annonce « pas d'eau ».
   *
   * S'il tombait sous le plus grand palier proposé, le palier mentirait :
   * quelqu'un demandant « de l'eau à moins de 2 km » ne verrait jamais les
   * itinéraires dont l'eau est à 1,8 km, sans que rien ne le dise.
   */
  it('le rayon de recherche couvre le plus grand palier proposé', () => {
    const plusGrandDetour = Math.max(...DETOURS_PROPOSES)
    expect(
      RAYON_DE_RECHERCHE_METERS * 2,
      'un palier proposé va plus loin que ce que la recherche examine : il mentirait en silence',
    ).toBeGreaterThanOrEqual(plusGrandDetour)
  })

  it('rend null au-delà du rayon, et une distance en deçà', () => {
    /*
      Les écarts sont **dérivés du rayon**, pas écrits en dur. La version
      d'avant plaçait le point proche à 0,008 ° — 890 m — sous un commentaire
      qui parlait déjà d'un autre chiffre que celui du code. Quand #318 a fait
      descendre le rayon de 1 000 m à 500, ce test est tombé : c'est la bonne
      façon de tomber, mais il n'aurait pas dû falloir le réécrire.
    */
    const DEG_PAR_METRE_LAT = 1 / 111_195
    const ecart = (facteur: number) =>
      LAT + RAYON_DE_RECHERCHE_METERS * facteur * DEG_PAR_METRE_LAT
    const [proche] = detoursParItineraire(
      [itin(1, 4.5, 4.51)],
      [poi('node/1', 'water', 4.505, ecart(0.8))],
    )
    const [loin] = detoursParItineraire(
      [itin(1, 4.5, 4.51)],
      [poi('node/1', 'water', 4.505, ecart(1.5))],
    )
    expect(proche?.water).not.toBeNull()
    expect(loin?.water).toBeNull()
  })

  it('un itinéraire sans géométrie ne fait pas tout tomber', () => {
    const vide: Itinerary = { ...itin(9, 4.5, 4.5), ways: [] }
    const [detours] = detoursParItineraire([vide], [poi('node/1', 'water', 4.5, LAT)])
    expect(detours?.water).toBeNull()
  })
})

describe('performance — une zone entière, pas une fiche', () => {
  /**
   * L'attribution tourne sur **toute** la zone, dans le fil principal, à
   * chaque changement de filtre. La fiche n'en traitait qu'un à la fois : le
   * coût n'a jamais été mesuré à cette échelle.
   *
   * Deux cents itinéraires de cent points, quatre cents POI — le plafond
   * qu'`out center 400` impose déjà à la requête. Une comparaison naïve
   * ferait 200 × 400 × 100 = huit millions de distances.
   */
  it('200 itinéraires × 400 POI en moins d’une seconde', () => {
    const itineraires = Array.from({ length: 200 }, (_, i) =>
      itin(i + 1, 4.5 + i * 0.02, 4.51 + i * 0.02),
    )
    const pois = Array.from({ length: 400 }, (_, i) =>
      poi(`node/${String(i)}`, i % 2 === 0 ? 'water' : 'shelter', 4.5 + i * 0.01, LAT + 0.0002),
    )
    const debut = performance.now()
    const resultats: DetoursPoi[] = detoursParItineraire(itineraires, pois)
    const duree = performance.now() - debut
    expect(resultats).toHaveLength(200)
    expect(duree, `attribution en ${duree.toFixed(0)} ms`).toBeLessThan(1_000)
  })
})


/**
 * Le palier le plus lointain que la liste propose ne doit pas dépasser ce que
 * la fiche accepte d'afficher (issues #156 et #318).
 *
 * Sans ce lien, quelqu'un filtrait « eau à moins de 2 km de détour », ouvrait
 * un itinéraire retenu par ce filtre, et n'y trouvait pas le point d'eau : le
 * rayon de la fiche l'écartait. Deux listes disant la même règle, et la disant
 * différemment — CLAUDE.md §4ter dans sa forme exacte.
 *
 * Le test est ici parce que la dérivation seule ne suffirait pas : elle
 * pourrait être défaite en une ligne, et personne ne le verrait avant qu'un
 * utilisateur ne cherche l'eau qu'on lui a promise.
 */
describe('les paliers de la liste et le rayon de la fiche (§4ter)', () => {
  it('ne propose aucun palier que la fiche n’afficherait pas', () => {
    for (const palier of DETOURS_PROPOSES) {
      expect(palier, `palier de ${String(palier)} m`).toBeLessThanOrEqual(
        DETOUR_MAX_METRES,
      )
    }
  })

  it('en propose quand même au moins un', () => {
    // La dérivation est un filtre : baisser `DETOUR_MAX_METRES` sous 250 le
    // viderait, et `Math.max()` d'un tableau vide rend -Infinity — un rayon
    // de recherche négatif, donc aucun POI, donc « aucun itinéraire n'a
    // d'eau ». L'échec doit se voir ici, pas sur le terrain.
    expect(DETOURS_PROPOSES.length).toBeGreaterThan(0)
    expect(RAYON_DE_RECHERCHE_METERS).toBeGreaterThan(0)
  })
})
