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
 * on cherche les `<coordinates>` de chaque `<LineString>`, avec ou sans
 * préfixe d'espace de noms (`<kml:LineString>`), après avoir retiré les
 * commentaires XML. Un `<Point>` ou le `<LinearRing>` d'un polygone ont
 * aussi des `<coordinates>`, mais hors de toute `<LineString>` : ils ne sont
 * pas lus. Ce qui ne se lit pas lève une erreur plutôt que de rendre moins
 * de lignes : un fichier vide écraserait le jeu embarqué sans rien dire.
 */
const PREFIXE = String.raw`(?:[\w.-]+:)?`
const LIGNE = new RegExp(String.raw`<${PREFIXE}LineString\b[^>]*>([\s\S]*?)</${PREFIXE}LineString>`, 'g')
const COORDONNEES = new RegExp(String.raw`<${PREFIXE}coordinates\b[^>]*>([\s\S]*?)</${PREFIXE}coordinates>`)
const COMMENTAIRE = /<!--[\s\S]*?-->/g
const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g
/** Un nombre décimal, signe et exposant permis — ni hexadécimal, ni vide, que `Number` accepterait. */
const DECIMAL = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

function nombre(valeur: string | undefined): number {
  return valeur !== undefined && DECIMAL.test(valeur) ? Number(valeur) : NaN
}

export function lignesDuKml(texte: string): [number, number][][] {
  const sansCommentaires = texte.replace(COMMENTAIRE, '')
  if (!new RegExp(String.raw`<${PREFIXE}kml\b`).test(sansCommentaires)) {
    throw new Error('ce fichier n’est pas un KML')
  }
  const lignes: [number, number][][] = []
  for (const [, contenu] of sansCommentaires.matchAll(LIGNE)) {
    const coordonnees = COORDONNEES.exec(contenu ?? '')
    if (!coordonnees) throw new Error('KML illisible : une LineString sans <coordinates>')
    const points = (coordonnees[1] ?? '')
      .replace(CDATA, '$1')
      .trim()
      .split(/\s+/)
      .filter((tuple) => tuple !== '')
      .map((tuple): [number, number] => {
        const [lon, lat] = tuple.split(',').map(nombre)
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
