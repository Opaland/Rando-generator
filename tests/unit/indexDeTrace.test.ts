import { describe, it, expect } from 'vitest'
import { runMatching } from '../../src/core/matching.ts'
import { CELL_SIZE_DEG, type Itinerary, type LonLat } from '../../src/core/types.ts'

/**
 * Comment la trace est rangée dans la grille, vu par ce qui est crédité.
 *
 * Deux trous trouvés par la vague de mutation du 18/10 sur `matching.ts` :
 *
 * - un segment long de plusieurs cellules est rangé dans toutes celles qu'il
 *   traverse. En longitude, un test le gardait ; en latitude, aucun — un
 *   segment nord-sud aurait pu n'occuper qu'une rangée, et le sentier qu'il
 *   longe n'être crédité qu'à ses deux bouts ;
 * - un segment coupé (trop long, ou trop rapide) laisse ses deux extrémités
 *   comme points isolés. Rien ne vérifiait qu'ils restent — et rien ne le
 *   peut, voir la fin du fichier.
 */

const METRES_PAR_DEGRE_LAT = 111_320

function itineraire(coords: LonLat[]): Itinerary {
  return {
    osmRelationId: 1,
    ref: null,
    name: 'nord-sud',
    network: 'PR',
    ways: [{ osmWayId: 1, coords }],
    totalMeters: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  }
}

/** Un sentier nord-sud de `longueur` mètres, un sommet tous les 50 m. */
function sentierMeridien(longueur: number): LonLat[] {
  return Array.from(
    { length: Math.round(longueur / 50) + 1 },
    (_, i): LonLat => [4.5, 45.4 + (i * 50) / METRES_PAR_DEGRE_LAT],
  )
}

const OPTIONS = { toleranceMeters: 25, computedAt: '2026-01-01T00:00:00Z' }

describe('un segment qui traverse plusieurs rangées de la grille', () => {
  const sentier = sentierMeridien(900)
  const sud = sentier[0] as LonLat
  const nord = sentier[sentier.length - 1] as LonLat

  it.each([
    ['du sud vers le nord', [sud, nord]],
    ['du nord vers le sud', [nord, sud]],
  ])('crédite le sentier en entier, %s', (_sens, trace) => {
    const { results } = runMatching([itineraire(sentier)], trace, OPTIONS)
    expect(results[0]?.pct).toBe(100)
  })
})

describe('une trace dans la cellule voisine, à l’est ou au nord', () => {
  /*
    Le balayage des cellules voisines va de −rayon à +rayon. Le borner à
    `dx < rayonX` (ou `dy < rayonY`) oubliait la colonne est et la rangée
    nord, et aucun test ne posait la trace de ce côté-là d'une frontière de
    cellule (vague du 18/10). Le côté ouest et le côté sud n'ont pas besoin
    d'un cas à eux : la boucle est symétrique, et `cx − dx` y est équivalent
    à `cx + dx`.

    Sentier à 0,0001° d'une frontière de cellule, trace à 0,00005° de l'autre
    côté : 0,00015°, 12 m en longitude et 17 m en latitude — sous le seuil de
    confirmation (0,4 × 50 = 20 m), et pas seulement sous la tolérance. La
    première version les posait à 31 m : sous la tolérance, mais jamais
    confirmées, donc 0 % avec le bon code.
  */
  const FRONTIERE_LON = 3001 * CELL_SIZE_DEG
  const FRONTIERE_LAT = 30_270 * CELL_SIZE_DEG // ≈ 45,405°
  const longueur = 900 / METRES_PAR_DEGRE_LAT

  it('la trouve à l’est', () => {
    const sentier: LonLat[] = [
      [FRONTIERE_LON - 0.0001, 45.4],
      [FRONTIERE_LON - 0.0001, 45.4 + longueur],
    ]
    const trace: LonLat[] = [
      [FRONTIERE_LON + 0.00005, 45.4],
      [FRONTIERE_LON + 0.00005, 45.4 + longueur],
    ]
    const { results } = runMatching([itineraire(sentier)], trace, {
      ...OPTIONS,
      toleranceMeters: 50,
    })
    expect(results[0]?.pct).toBe(100)
  })

  it('la trouve au nord', () => {
    const largeur = 900 / 78_710
    const sentier: LonLat[] = [
      [4.5, FRONTIERE_LAT - 0.0001],
      [4.5 + largeur, FRONTIERE_LAT - 0.0001],
    ]
    const trace: LonLat[] = [
      [4.5, FRONTIERE_LAT + 0.00005],
      [4.5 + largeur, FRONTIERE_LAT + 0.00005],
    ]
    const { results } = runMatching([itineraire(sentier)], trace, {
      ...OPTIONS,
      toleranceMeters: 50,
    })
    expect(results[0]?.pct).toBe(100)
  })
})

/*
  Ce que ce fichier ne garde pas, et pourquoi (§6bis) : vider le bloc qui
  range les deux extrémités d'un segment coupé (`addToCells(…{ a, b: a })`).
  Un test l'a tenté — des points tous les 1 100 m, chaque segment coupé — et
  il était rouge **avec** le bon code : un point seul ne crédite jamais rien.
  Il couvre 2 × la tolérance, 200 m au plus (`MAX_TOLERANCE`, 100 m), quand
  un passage demande trois échantillons espacés de `STEP_METERS` (100 m),
  soit 200 m pile — atteint seulement si les deux distances extrêmes
  tombent exactement sur la tolérance, ce que l'arrondi de la géodésie
  défait. Une extrémité qui n'est pas seule appartient aussi au segment
  voisin, non coupé. Le mutant est donc équivalent dans la plage de
  réglages de l'application ; il ne le serait plus si `MAX_TOLERANCE`
  montait au-dessus de 100 m.
*/
