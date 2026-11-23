/**
 * Les lignes d'un fichier KML (OGC 07-147r2), en longitude puis latitude
 * WGS84 — la seule projection que KML connaisse : rien à reprojeter.
 * Issue #87.
 *
 * Le PDIPR de la Savoie n'est publié qu'ainsi (data.gouv.fr, 26/01/2022).
 * Seules les `<LineString>` sont lues, seules ou dans un `<MultiGeometry>` ;
 * les attributs (`<ExtendedData>`) ne le sont pas : le réseau de fond ne
 * garde que la géométrie (`scripts/preparer-pdipr.mjs`).
 *
 * Ne sert qu'à la préparation, sous Node, où il n'y a pas de `DOMParser` :
 * on cherche les `<coordinates>` de chaque `<LineString>`. Un `<Point>` ou
 * le `<LinearRing>` d'un polygone ont aussi des `<coordinates>`, mais hors
 * de toute `<LineString>` : ils ne sont pas lus.
 */
const LIGNE = /<LineString\b[^>]*>([\s\S]*?)<\/LineString>/g
const COORDONNEES = /<coordinates>([\s\S]*?)<\/coordinates>/

export function lignesDuKml(texte: string): [number, number][][] {
  if (!/<kml\b/.test(texte)) throw new Error('ce fichier n’est pas un KML')
  const lignes: [number, number][][] = []
  for (const [, contenu] of texte.matchAll(LIGNE)) {
    const brut = COORDONNEES.exec(contenu ?? '')?.[1] ?? ''
    const points = brut
      .trim()
      .split(/\s+/)
      .filter((tuple) => tuple !== '')
      .map((tuple): [number, number] => {
        // `Number('')` vaut 0 : un tuple « 3, » poserait un point sur
        // l'équateur. Une valeur vide est refusée comme une illisible.
        const [lon, lat] = tuple.split(',').map((v) => (v === '' ? NaN : Number(v)))
        if (lon === undefined || lat === undefined || !Number.isFinite(lon) || !Number.isFinite(lat)) {
          throw new Error(`KML illisible : coordonnée « ${tuple} »`)
        }
        return [lon, lat]
      })
    // KML exige au moins deux tuples dans une LineString : en deçà, ce
    // n'est pas une ligne qu'on puisse dessiner.
    if (points.length >= 2) lignes.push(points)
  }
  return lignes
}
