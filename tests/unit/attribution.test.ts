import { describe, it, expect } from 'vitest'
import { attributionDe, mentionDeSource } from '../../src/core/gpxExport.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

/**
 * Issue #87, volet licence — l'attribution de Léa.
 *
 * Trouvé à la revue globale du 23/08. Léa importe le PDIPR de son
 * département, ouvert sous Licence Ouverte. Le fichier devient un itinéraire
 * de réseau `PERSO`, et `gpxAttributionFor` répondait :
 *
 *     case 'PERSO':
 *       // Tracé de l'utilisateur : rien à attribuer, c'est le sien.
 *       return null
 *
 * **Ce commentaire est faux dans son cas.** Le tracé n'est pas le sien :
 * c'est celui de son département, et la Licence Ouverte **oblige** à
 * l'attribution. Exporter ce sentier en GPX produisait un fichier muet.
 *
 * La cause est structurelle : l'attribution était dérivée du **réseau**, ce
 * qui confond le type de sentier avec sa provenance. Un itinéraire porte
 * désormais sa source quand il en a une, et le réseau ne sert plus que de
 * repli.
 */

const WAYS = [{ osmWayId: 1, coords: straightLine(4.5, 45.4, 1_000, 100) }]

describe('attributionDe', () => {
  it('attribue à OpenStreetMap ce qui en vient', () => {
    const gr = makeItinerary(1, WAYS, { network: 'GR' })
    expect(attributionDe(gr)?.author).toBe('les contributeurs OpenStreetMap')
  })

  it('attribue à la Métropole ses boucles', () => {
    const local = makeItinerary(2, WAYS, { network: 'LOCAL' })
    expect(attributionDe(local)?.author).toBe('Métropole de Lyon')
  })

  it('n’attribue rien à un tracé vraiment dessiné à la main', () => {
    const perso = makeItinerary(-1, WAYS, { network: 'PERSO' })
    expect(attributionDe(perso)).toBeNull()
  })

  /** Le cas de Léa : la source déclarée dans le fichier l'emporte. */
  it('préfère la source que l’itinéraire porte', () => {
    const pdipr = makeItinerary(-2, WAYS, {
      network: 'PERSO',
      attribution: {
        author: 'Département de l’Ain',
        license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
      },
    })
    expect(attributionDe(pdipr)?.author).toBe('Département de l’Ain')
  })

  /**
   * Et elle l'emporte aussi sur un réseau OSM : si un fichier déclare sa
   * provenance, c'est elle qui fait foi, pas notre classement.
   */
  it('l’emporte même sur un réseau connu', () => {
    const gr = makeItinerary(3, WAYS, {
      network: 'GR',
      attribution: { author: 'IGN', license: 'https://example.invalid/lo' },
    })
    expect(attributionDe(gr)?.author).toBe('IGN')
  })
})

describe('mentionDeSource', () => {
  it('ne dit rien quand la source est connue', () => {
    expect(mentionDeSource(makeItinerary(1, WAYS, { network: 'GR' }))).toBeNull()
  })

  it('ne dit rien d’un tracé dessiné à la main', () => {
    expect(
      mentionDeSource(makeItinerary(-1, WAYS, { network: 'PERSO' })),
    ).toBeNull()
  })

  /**
   * Le cas qu'on ne peut pas régler à la place de Léa : un fichier importé
   * qui ne déclare pas sa provenance. On ne l'invente pas — on prévient que
   * l'export sera muet, et elle décide.
   */
  it('prévient quand un fichier importé ne déclare pas sa source', () => {
    const importe = makeItinerary(-2, WAYS, {
      network: 'PERSO',
      importe: true,
    })
    const texte = mentionDeSource(importe)
    expect(texte).toMatch(/source/i)
    expect(texte).toMatch(/licence/i)
  })
})
