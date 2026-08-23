import { describe, it, expect } from 'vitest'
import {
  calerSurCouchages,
  couchagesLeLongDuTrace,
  type CouchageSitue,
} from '../../src/core/stages.ts'
import type { Stage } from '../../src/core/stages.ts'
import type { LonLat, PointOfInterest } from '../../src/core/types.ts'

/**
 * Issue #161, point 1 — une étape en montagne est décidée par le refuge.
 *
 * Camille prépare trois semaines sur la Grande Traversée des Alpes. Un
 * découpage tous les 22 km qui la fait dormir à 4 km d'un refuge est joli sur
 * le papier et inutilisable sur le terrain. Les refuges sont déjà
 * téléchargés et classés ; le découpage les ignorait.
 *
 * ## La fenêtre ne s'invente pas
 *
 * Déplacer une coupure demande de dire **jusqu'où**. Le nombre n'est pas posé
 * au jugement : c'est **la moitié de la longueur d'étape**, parce que c'est
 * le plus grand déplacement qui garde les coupures dans l'ordre — au-delà,
 * une coupure passerait devant sa voisine et les étapes se croiseraient.
 * La géométrie du problème donne la borne ; il n'y avait rien à décider.
 */

function etape(index: number, debut: number, fin: number): Stage {
  return {
    index,
    startMeters: debut,
    endMeters: fin,
    meters: fin - debut,
    doneMeters: 0,
    pct: 0,
    start: [4.5, 45.4],
    end: [4.6, 45.4],
    bounds: [
      [4.5, 45.4],
      [4.6, 45.5],
    ],
  }
}

function couchage(nom: string, metres: number, detour = 100): CouchageSitue {
  return { nom, metresLeLongDuTrace: metres, detourMetres: detour }
}

const DEUX_ETAPES = [etape(1, 0, 20_000), etape(2, 20_000, 40_000)]

describe('calerSurCouchages', () => {
  it('ne change rien quand aucun couchage n’est connu', () => {
    const cale = calerSurCouchages(DEUX_ETAPES, [], 20_000)
    expect(cale.map((e) => e.endMeters)).toEqual([20_000, 40_000])
    expect(cale[0]?.couchage).toBeNull()
  })

  it('amène la coupure au refuge le plus proche', () => {
    const cale = calerSurCouchages(
      DEUX_ETAPES,
      [couchage('Refuge de la Dent', 18_400)],
      20_000,
    )
    expect(cale[0]?.endMeters).toBe(18_400)
    expect(cale[0]?.couchage?.nom).toBe('Refuge de la Dent')
    // L'étape suivante repart de là : les étapes restent jointives.
    expect(cale[1]?.startMeters).toBe(18_400)
  })

  /** La dernière coupure est l'arrivée : elle ne se déplace pas. */
  it('ne déplace pas l’arrivée', () => {
    const cale = calerSurCouchages(
      DEUX_ETAPES,
      [couchage('Refuge du Bout', 38_000)],
      20_000,
    )
    expect(cale[1]?.endMeters).toBe(40_000)
  })

  /**
   * La borne est la moitié de la longueur d'étape. Un refuge au-delà ne peut
   * pas décider de cette coupure-là — il décidera peut-être de la suivante.
   */
  it('ignore un couchage hors de la fenêtre', () => {
    const cale = calerSurCouchages(
      DEUX_ETAPES,
      [couchage('Refuge trop loin', 9_000)],
      20_000,
    )
    expect(cale[0]?.endMeters).toBe(20_000)
    expect(cale[0]?.couchage).toBeNull()
  })

  it('accepte un couchage pile à la limite de la fenêtre', () => {
    const cale = calerSurCouchages(
      DEUX_ETAPES,
      [couchage('Refuge limite', 10_000)],
      20_000,
    )
    expect(cale[0]?.endMeters).toBe(10_000)
  })

  it('choisit le plus proche quand il y en a plusieurs', () => {
    const cale = calerSurCouchages(
      DEUX_ETAPES,
      [couchage('Loin', 15_000), couchage('Proche', 19_500)],
      20_000,
    )
    expect(cale[0]?.couchage?.nom).toBe('Proche')
  })

  /**
   * Deux coupures ne peuvent pas tomber sur le même refuge : la seconde
   * produirait une étape de longueur nulle.
   */
  it('n’attribue pas deux fois le même couchage', () => {
    const trois = [etape(1, 0, 10_000), etape(2, 10_000, 20_000), etape(3, 20_000, 30_000)]
    const cale = calerSurCouchages(trois, [couchage('Unique', 12_000)], 10_000)
    const pris = cale.filter((e) => e.couchage !== null)
    expect(pris).toHaveLength(1)
  })

  it('garde les coupures dans l’ordre', () => {
    const trois = [etape(1, 0, 10_000), etape(2, 10_000, 20_000), etape(3, 20_000, 30_000)]
    const cale = calerSurCouchages(
      trois,
      [couchage('A', 14_000), couchage('B', 6_000)],
      10_000,
    )
    const fins = cale.map((e) => e.endMeters)
    expect([...fins].sort((a, b) => a - b)).toEqual(fins)
  })
})

describe('couchagesLeLongDuTrace', () => {
  const trace: LonLat[] = Array.from(
    { length: 21 },
    (_, i) => [4.5 + i / 78, 45.4] as LonLat,
  )

  function poi(kind: PointOfInterest['kind'], lon: number): PointOfInterest {
    return {
      id: `node/${String(lon)}`,
      lon,
      lat: 45.4,
      kind,
      name: `Poste ${String(lon)}`,
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

  /** Un abri météo n'est pas un couchage : il n'est pas prévu pour la nuit. */
  it('ne retient que ce où l’on dort', () => {
    const couchages = couchagesLeLongDuTrace(
      [poi('hut', 4.55), poi('bivouac', 4.6), poi('shelter', 4.62), poi('water', 4.63)],
      trace,
    )
    expect(couchages.map((c) => c.nom)).toEqual(['Poste 4.55', 'Poste 4.6'])
  })

  it('situe chaque couchage le long du tracé', () => {
    const [premier] = couchagesLeLongDuTrace([poi('hut', 4.55)], trace)
    // 4,55° à cette latitude ≈ 3,9 km depuis le départ.
    expect(premier?.metresLeLongDuTrace).toBeGreaterThan(3_000)
    expect(premier?.metresLeLongDuTrace).toBeLessThan(5_000)
  })

  it('les rend dans l’ordre du parcours', () => {
    const couchages = couchagesLeLongDuTrace(
      [poi('hut', 4.7), poi('bivouac', 4.55)],
      trace,
    )
    expect(couchages[0]?.metresLeLongDuTrace).toBeLessThan(
      couchages[1]?.metresLeLongDuTrace ?? 0,
    )
  })
})
