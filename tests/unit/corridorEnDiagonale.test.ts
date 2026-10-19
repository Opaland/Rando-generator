import { describe, it, expect } from 'vitest'
import { cleTuile, tuileDe, tuilesDuCorridor } from '../../src/core/corridor.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Le corridor d'un segment qui n'est pas est-ouest (vague de mutation du
 * 19/10).
 *
 * Le seul test de continuité suivait une ligne de latitude constante : la
 * latitude des points interpolés n'y bougeait pas, et la longueur nord-sud
 * qui décide du nombre de pas valait zéro. Une interpolation de latitude
 * fausse, ou une composante nord-sud divisée au lieu de multipliée,
 * survivaient. Sur le terrain, c'est une montée vers un col : des tuiles
 * sautées, ou d'autres prises à côté, et la carte hors ligne a des trous là
 * où l'on marche.
 *
 * La référence est le segment échantillonné très finement. Deux garanties,
 * et pas une de plus :
 *
 * - à rayon nul, **aucune tuile d'ailleurs** : chaque tuile rendue est
 *   traversée par le segment ;
 * - dès qu'il y a un rayon, **aucune tuile traversée ne manque**.
 *
 * À rayon nul, en revanche, des tuiles manquent — mesuré le 19/10 sur ce
 * segment en diagonale : 7 sur 54, jusqu'à 134 m de traversée. Ce sont des
 * coins franchis entre deux points du pas ; aucun pas fini ne les attrape,
 * puisqu'un coin peut être frôlé sur une longueur aussi courte qu'on veut.
 * La marge d'une tuile, posée dès le premier mètre de rayon, les couvre, et
 * l'application emporte toujours à 500 m (`RAYON_CORRIDOR_METRES`).
 */
function tuilesTraversees(a: LonLat, b: LonLat, z: number): Set<string> {
  const vues = new Set<string>()
  const n = 20_000
  for (let k = 0; k <= n; k++) {
    const t = k / n
    vues.add(cleTuile(tuileDe(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z)))
  }
  return vues
}

describe('le corridor d’un segment qui n’est pas est-ouest', () => {
  const z = 16
  const cas: [string, LonLat, LonLat][] = [
    ['nord-sud', [4.55, 45.3], [4.55, 45.45]],
    ['en diagonale', [4.5, 45.3], [4.62, 45.42]],
  ]

  it.each(cas)('%s : à rayon nul, aucune tuile hors du segment', (_sens, a, b) => {
    const reference = tuilesTraversees(a, b, z)
    expect(reference.size).toBeGreaterThan(30)
    const corridor = tuilesDuCorridor([a, b], { zooms: [z], rayonMetres: 0 }).map(cleTuile)
    expect(corridor.filter((c) => !reference.has(c))).toEqual([])
  })

  it.each(cas)('%s : dès un mètre de rayon, aucune tuile traversée ne manque', (_sens, a, b) => {
    const corridor = new Set(tuilesDuCorridor([a, b], { zooms: [z], rayonMetres: 1 }).map(cleTuile))
    expect([...tuilesTraversees(a, b, z)].filter((c) => !corridor.has(c))).toEqual([])
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `centre.x + dx` et `centre.y + dy` en soustraction : la boucle va de
    −marge à +marge, symétrique — le même carré dans l'autre sens ;
  - `b[0] − a[0]` en addition dans la distance approchée : elle surestime,
    donc plus de pas, donc les mêmes tuiles — majorer est précisément ce que
    la fonction s'autorise ;
  - la latitude moyenne faussée (`a[1] − b[1]`, presque zéro) : le pas est
    alors calculé à l'équateur, 1/cos(lat) fois plus long — 0,7 tuile à 45°,
    0,8 à 51°. Il reste sous la tuile, deux points successifs restent dans
    des tuiles voisines, et la marge couvre le reste. Équivalent sous les
    latitudes de la France ; il ne le serait plus au-delà de 60° ;
  - `pas > 0` forcé à vrai ou en `>=` : documenté dans le code comme une
    division par zéro qu'aucune latitude réelle ne produit ;
  - `coords.length === 0` retiré : sans point, la boucle ne rend rien de
    toute façon.
*/
