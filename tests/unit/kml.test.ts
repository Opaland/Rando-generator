import { describe, it, expect } from 'vitest'
import { lignesDuKml } from '../../src/core/kml.ts'

/**
 * Un document KML minimal, à la façon de celui que publie le Département de
 * la Savoie (data.gouv.fr, 26/01/2022) : des `<Placemark>` dont la géométrie
 * est un `<MultiGeometry>` de `<LineString>`, et des attributs en
 * `<ExtendedData>` que le lecteur n'a pas à lire.
 */
function kml(placemarks: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document id="root_doc"><Folder><name>PDIPR</name>
${placemarks}
</Folder></Document></kml>`
}

function placemark(geometrie: string): string {
  return `<Placemark>
  <ExtendedData><SchemaData schemaUrl="#PDIPR"><SimpleData name="Entretenu">oui</SimpleData></SchemaData></ExtendedData>
  ${geometrie}
</Placemark>`
}

describe('lignesDuKml', () => {
  it('lit une ligne en longitude puis latitude, et laisse l’altitude', () => {
    const texte = kml(
      placemark(
        '<MultiGeometry><LineString><coordinates>6.808,45.2607,0 6.809,45.2608,12</coordinates></LineString></MultiGeometry>',
      ),
    )
    expect(lignesDuKml(texte)).toEqual([
      [
        [6.808, 45.2607],
        [6.809, 45.2608],
      ],
    ])
  })

  it('rend chaque ligne d’un même objet à part, et lit une ligne hors MultiGeometry', () => {
    const texte = kml(
      placemark(
        '<MultiGeometry>' +
          '<LineString><coordinates>1,2 3,4</coordinates></LineString>' +
          '<LineString><coordinates>5,6 7,8</coordinates></LineString>' +
          '</MultiGeometry>',
      ) + placemark('<LineString><tessellate>1</tessellate><coordinates>9,10 11,12</coordinates></LineString>'),
    )
    expect(lignesDuKml(texte)).toEqual([
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
      [
        [9, 10],
        [11, 12],
      ],
    ])
  })

  it('accepte les tuples séparés par des retours à la ligne et des tabulations', () => {
    const texte = kml(
      placemark('<LineString><coordinates>\n\t1.5,2.5,0\n\t3.5,4.5,0\n</coordinates></LineString>'),
    )
    expect(lignesDuKml(texte)).toEqual([
      [
        [1.5, 2.5],
        [3.5, 4.5],
      ],
    ])
  })

  it('ne rend rien pour un objet sans géométrie : 65 du jeu de la Savoie sont ainsi', () => {
    expect(lignesDuKml(kml(placemark('<MultiGeometry></MultiGeometry>')))).toEqual([])
  })

  it('ignore les points et les contours de polygones, qui ne sont pas des lignes', () => {
    const texte = kml(
      placemark('<Point><coordinates>1,2,0</coordinates></Point>') +
        placemark(
          '<Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon>',
        ),
    )
    expect(lignesDuKml(texte)).toEqual([])
  })

  it('écarte une ligne de moins de deux points, que KML ne permet pas', () => {
    const texte = kml(
      placemark('<LineString><coordinates>1,2</coordinates></LineString>') +
        placemark('<LineString><coordinates>3,4 5,6</coordinates></LineString>'),
    )
    expect(lignesDuKml(texte)).toEqual([
      [
        [3, 4],
        [5, 6],
      ],
    ])
  })

  it('refuse un fichier qui n’est pas du KML', () => {
    expect(() => lignesDuKml('{"type":"FeatureCollection","features":[]}')).toThrow(
      'ce fichier n’est pas un KML',
    )
  })

  it('refuse une coordonnée illisible plutôt que de poser un point en 0, 0', () => {
    const texte = kml(placemark('<LineString><coordinates>1,2 3,abc</coordinates></LineString>'))
    expect(() => lignesDuKml(texte)).toThrow('KML illisible : coordonnée « 3,abc »')
  })

  it('refuse un tuple sans latitude', () => {
    const texte = kml(placemark('<LineString><coordinates>1,2 3</coordinates></LineString>'))
    expect(() => lignesDuKml(texte)).toThrow('KML illisible : coordonnée « 3 »')
  })

  it('refuse une latitude vide, que `Number` lirait 0', () => {
    const texte = kml(placemark('<LineString><coordinates>1,2 3,</coordinates></LineString>'))
    expect(() => lignesDuKml(texte)).toThrow('KML illisible : coordonnée « 3, »')
  })
})
