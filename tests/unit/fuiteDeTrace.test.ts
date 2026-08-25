import { describe, it, expect } from 'vitest'
import {
  echantillonDeTrace,
  corpsContientUnPoint,
  PRECISION_MINIMALE,
} from '../../src/core/fuiteDeTrace.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #178 — « 0 requête contenait vos traces » doit être une mesure.
 *
 * Jusqu'au 25/08, ce zéro était **écrit en dur** dans `SortiesReseau.tsx`.
 * L'application affichait comme un fait vérifié un nombre qui ne pouvait pas
 * changer — c'est le §1 appliqué à l'interface plutôt qu'à un test : un
 * indicateur qui ne peut pas monter ne prouve rien, et il est plus difficile
 * à remettre en cause qu'une phrase, parce qu'il a l'air d'être compté.
 */
const trace: LonLat[] = [
  [4.512345, 45.412345],
  [4.523456, 45.423456],
  [4.534567, 45.434567],
]

describe('echantillonDeTrace', () => {
  it('ne rend rien pour une trace vide', () => {
    expect(echantillonDeTrace([], 10)).toEqual([])
  })

  it('borne le travail : au plus quatre écritures par point retenu', () => {
    /*
      La recherche tourne à chaque requête sortante, sur le fil principal :
      ce qu'elle coûte doit être borné par construction et non par
      l'espérance qu'une trace soit courte.

      Quatre par point, et c'est de l'arithmétique : chaque coordonnée a au
      plus deux écritures — tronquée et arrondie — et on les croise. Un
      point dont les deux écritures coïncident en donne moins.
    */
    const longue: LonLat[] = Array.from(
      { length: 500 },
      (_, i) => [4.5 + i * 1e-4, 45.4 + i * 1e-4] as LonLat,
    )
    expect(echantillonDeTrace(longue, 12).length).toBeLessThanOrEqual(12 * 4)
  })

  it('prend des points répartis, pas les douze premiers', () => {
    /*
      Un échantillon pris en tête ne verrait pas une fuite qui n'emporterait
      que la fin d'une sortie. Le premier et le dernier point y sont
      toujours : ce sont ceux qui disent où l'on part et où l'on arrive.
    */
    const longue: LonLat[] = Array.from(
      { length: 100 },
      (_, i) => [4.5 + i * 1e-4, 45.4] as LonLat,
    )
    const ech = echantillonDeTrace(longue, 5)
    expect(ech.some((p) => p.includes('4.5000'))).toBe(true)
    expect(ech.some((p) => p.includes('4.5099'))).toBe(true)
  })
})

describe('corpsContientUnPoint', () => {
  const ech = echantillonDeTrace(trace, 12)

  it('reconnaît un point de la trace posté tel quel', () => {
    const corps = JSON.stringify({
      lon: [4.512345],
      lat: [45.412345],
    })
    expect(corpsContientUnPoint(corps, ech)).toBe(true)
  })

  it('reconnaît un point même écrit dans l’autre ordre', () => {
    expect(corpsContientUnPoint('45.412345|4.512345', ech)).toBe(true)
  })

  it('ne s’alarme pas d’une requête ordinaire', () => {
    // Une requête Overpass porte une aire et des tags, pas des points.
    const overpass =
      '[out:json][timeout:180];area["ref:INSEE"="42"];relation["route"="hiking"](area);out geom;'
    expect(corpsContientUnPoint(overpass, ech)).toBe(false)
  })

  it('ne s’alarme pas d’une coordonnée arrondie que tout le monde envoie', () => {
    /*
      Le centre de la carte part à chaque déplacement, à faible précision.
      « 45.41 » ou « 4.51 » désignent un carré de plus d'un kilomètre : les
      compter comme une fuite rendrait le compteur inutilisable, et lui
      ferait crier au loup en permanence.

      D'où le seuil : un point n'est reconnu qu'à PRECISION_MINIMALE
      décimales, **et** avec sa latitude et sa longitude toutes deux
      présentes. Ce seuil ne change pas ce qui est calculé — il décide de ce
      qu'on appelle « un point de votre trace » — mais il est écrit ici
      plutôt que caché (§2).
    */
    expect(corpsContientUnPoint('{"center":[4.51,45.41],"zoom":12}', ech)).toBe(
      false,
    )
    expect(PRECISION_MINIMALE).toBeGreaterThanOrEqual(5)
  })

  it('exige les deux coordonnées du même point, pas une seule', () => {
    // Une longitude seule peut appartenir à n'importe quoi ; le couple, non.
    expect(corpsContientUnPoint('{"lon":4.512345}', ech)).toBe(false)
  })

  it('ne dit rien d’un corps vide ou absent', () => {
    expect(corpsContientUnPoint('', ech)).toBe(false)
    expect(corpsContientUnPoint(null, ech)).toBe(false)
    expect(corpsContientUnPoint('45.412345|4.512345', [])).toBe(false)
  })
})
