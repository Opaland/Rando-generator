import { describe, it, expect } from 'vitest'
import { poiPopupHtml } from '../../src/components/map/poiPopup.ts'

/**
 * Infobulle des points d'intérêt (issue #9 : sortir la logique de MapView
 * pour pouvoir l'éprouver).
 *
 * Ces chaînes portent des noms venus d'OpenStreetMap, donc d'inconnus.
 */
describe('poiPopupHtml', () => {
  it('donne le nom en titre et le type en dessous', () => {
    const html = poiPopupHtml({ name: 'Refuge du Pilat', kind: 'hut' })
    expect(html).toContain('<strong>Refuge du Pilat</strong>')
    expect(html).toMatch(/<span>[^<]*[Rr]efuge/)
  })

  it('annonce la capacité quand elle est connue', () => {
    expect(poiPopupHtml({ name: 'Refuge du Pilat', kind: 'hut', capacity: '32' }))
      .toContain('32 places')
  })

  it('se rabat sur le type quand le point n’a pas de nom', () => {
    const html = poiPopupHtml({ kind: 'water' })
    expect(html).toMatch(/<strong>[^<]+<\/strong>/)
    // Sans nom, le titre porte déjà le type : le répéter ne dirait rien de plus.
    expect(html).not.toContain('<span>')
  })

  it('garde la capacité d’un point sans nom', () => {
    expect(poiPopupHtml({ kind: 'hut', capacity: '12' })).toContain('12 places')
  })

  it('affiche un nom malveillant au lieu de l’exécuter', () => {
    // Un nom d'OpenStreetMap est écrit par n'importe qui : l'infobulle est
    // construite en HTML, donc l'échappement n'est pas une précaution de
    // style.
    const html = poiPopupHtml({
      name: '<img src=x onerror="alert(1)">',
      kind: 'hut',
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('échappe aussi la capacité, qui vient du même endroit', () => {
    const html = poiPopupHtml({ kind: 'hut', capacity: '<b>12</b>' })
    expect(html).not.toContain('<b>')
  })

  it('tient debout sans aucune propriété', () => {
    expect(poiPopupHtml(undefined)).toContain('<strong>')
  })
})
