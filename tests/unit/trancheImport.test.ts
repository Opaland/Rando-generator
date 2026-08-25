import { describe, it, expect } from 'vitest'
import { messageDeLecture } from '../../src/store/trancheImport.ts'
import { GpxError } from '../../src/core/gpx.ts'
import { FitError } from '../../src/core/fit.ts'
import { TcxError } from '../../src/core/tcx.ts'
import { GeoJsonError } from '../../src/core/geojson.ts'

/**
 * Le message d'un fichier illisible (troisième tranche du store, #155).
 *
 * Ces quatre `instanceof` étaient **recopiés dans les deux actions
 * d'import** — celle des traces et celle des itinéraires. Quatre formats,
 * deux copies à garder d'accord, et rien qui le vérifiait.
 *
 * C'est le mode d'échec du §4 dans sa forme exacte, et le dépôt en porte
 * déjà quatre cicatrices : « trois gardes de démonstration écrites à la
 * main, une quatrième oubliée — et la PR affirmait avoir couvert les trois
 * chemins ».
 *
 * Le test ci-dessous ne vérifie pas seulement que les quatre formats sont
 * nommés : il vérifie qu'**un cinquième arriverait nommé aussi**, parce que
 * la garde interroge la liste et non une suite de `if`.
 */
describe('messageDeLecture', () => {
  it('donne le message de l\u2019erreur quand le format est reconnu', () => {
    expect(messageDeLecture('trace.gpx', new GpxError('XML invalide'))).toBe(
      'trace.gpx : XML invalide',
    )
    expect(
      messageDeLecture('montre.fit', new FitError('en-tête tronqué')),
    ).toBe('montre.fit : en-tête tronqué')
    expect(
      messageDeLecture('vieux.tcx', new TcxError('pas de trackpoint')),
    ).toBe('vieux.tcx : pas de trackpoint')
    expect(
      messageDeLecture('pdipr.geojson', new GeoJsonError('Lambert 93')),
    ).toBe('pdipr.geojson : Lambert 93')
  })

  /**
   * Une erreur inattendue ne montre pas son message : il vient d'ailleurs
   * — d'une pile du navigateur, d'un quota, d'une bibliothèque — et ne
   * s'adresse à personne. « Lecture impossible » est vague, et c'est
   * exactement ce qu'on sait.
   */
  it('reste vague sur ce qu\u2019il ne comprend pas', () => {
    expect(messageDeLecture('x.gpx', new Error('ENOSPC: no space left'))).toBe(
      'x.gpx : lecture impossible.',
    )
    expect(messageDeLecture('x.gpx', 'une chaîne')).toBe(
      'x.gpx : lecture impossible.',
    )
    expect(messageDeLecture('x.gpx', null)).toBe('x.gpx : lecture impossible.')
  })

  /**
   * La garde de la garde.
   *
   * Les quatre erreurs de lecture ont toutes un `name` propre. Si un
   * cinquième format arrive avec sa classe d'erreur et qu'on oublie de
   * l'ajouter, ce test **ne le verra pas** — aucun test ne peut voir un
   * fichier qui n'existe pas encore. Ce qu'il garde, c'est que le mécanisme
   * reste une **liste**, consultée une fois, et non deux suites de `if`
   * qu'il faudrait tenir d'accord. C'est ce qui rend l'oubli réparable en
   * un seul endroit au lieu de deux.
   */
  it('reconnaît par la liste, pas par une suite de conditions', () => {
    class ErreurInconnue extends Error {
      override name = 'ErreurInconnue'
    }
    expect(messageDeLecture('x.kml', new ErreurInconnue('un jour'))).toBe(
      'x.kml : lecture impossible.',
    )
  })
})
