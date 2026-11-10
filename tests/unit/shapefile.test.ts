import { describe, it, expect } from 'vitest'
import { lignesDuShapefile } from '../../src/core/shapefile.ts'

/**
 * Un shapefile de polylignes (type 3), écrit octet par octet selon la
 * spécification ESRI de juillet 1998 : en-tête de 100 octets, puis des
 * enregistrements dont l'en-tête est gros-boutiste et le contenu
 * petit-boutiste. Le PDIPR du Rhône est livré ainsi (#87).
 */
function shapefile(enregistrements: (number[][][] | null)[], typeFichier = 3): ArrayBuffer {
  const contenus = enregistrements.map((parties) => {
    if (parties === null) {
      const c = new DataView(new ArrayBuffer(4))
      c.setInt32(0, 0, true) // forme nulle
      return c
    }
    const points = parties.flat()
    const c = new DataView(new ArrayBuffer(44 + 4 * parties.length + 16 * points.length))
    c.setInt32(0, 3, true)
    c.setInt32(36, parties.length, true)
    c.setInt32(40, points.length, true)
    let debut = 0
    parties.forEach((p, i) => {
      c.setInt32(44 + 4 * i, debut, true)
      debut += p.length
    })
    points.forEach(([x, y], i) => {
      const o = 44 + 4 * parties.length + 16 * i
      c.setFloat64(o, x as number, true)
      c.setFloat64(o + 8, y as number, true)
    })
    return c
  })
  const total = 100 + contenus.reduce((t, c) => t + 8 + c.byteLength, 0)
  const sortie = new DataView(new ArrayBuffer(total))
  sortie.setInt32(0, 9994, false)
  sortie.setInt32(24, total / 2, false)
  sortie.setInt32(28, 1000, true)
  sortie.setInt32(32, typeFichier, true)
  let o = 100
  contenus.forEach((c, i) => {
    sortie.setInt32(o, i + 1, false)
    sortie.setInt32(o + 4, c.byteLength / 2, false)
    new Uint8Array(sortie.buffer).set(new Uint8Array(c.buffer), o + 8)
    o += 8 + c.byteLength
  })
  return sortie.buffer
}

describe('lignesDuShapefile', () => {
  it('lit chaque partie de chaque polyligne, dans l’ordre', () => {
    const shp = shapefile([
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      [
        [
          [5, 6],
          [7, 8],
          [9, 10],
        ],
        [
          [11, 12],
          [13, 14],
        ],
      ],
    ])
    expect(lignesDuShapefile(shp)).toEqual([
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
        [9, 10],
      ],
      [
        [11, 12],
        [13, 14],
      ],
    ])
  })

  it('saute une forme nulle sans perdre la suite', () => {
    const shp = shapefile([
      null,
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      // En dernier aussi : lue comme une polyligne, elle déborderait du fichier.
      null,
    ])
    expect(lignesDuShapefile(shp)).toEqual([
      [
        [1, 2],
        [3, 4],
      ],
    ])
  })

  /*
    Relecture adverse du 10/11 : une longueur d'enregistrement négative
    ramenait la lecture sur elle-même, et la préparation ne rendait jamais
    la main ; un fichier tronqué levait un RangeError qui ne disait rien.
  */
  it('dit qu’un fichier est corrompu au lieu de boucler ou de lever au hasard', () => {
    const bon = shapefile([
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    ])
    const negatif = new DataView(bon.slice(0))
    negatif.setInt32(104, -4, false)
    expect(() => lignesDuShapefile(negatif.buffer)).toThrow(/corrompu/)
    expect(() => lignesDuShapefile(bon.slice(0, bon.byteLength - 8))).toThrow(/corrompu/)
  })

  it('refuse ce qui n’est pas un shapefile de polylignes', () => {
    expect(() => lignesDuShapefile(shapefile([], 1))).toThrow(/polylignes/)
    expect(() => lignesDuShapefile(new ArrayBuffer(100))).toThrow(/shapefile/)
  })
})
