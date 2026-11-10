/**
 * Les polylignes d'un fichier `.shp` (spécification ESRI, juillet 1998),
 * dans les coordonnées du fichier — aucune projection ici. Issue #87.
 *
 * Le PDIPR du Rhône est livré en shapefile, et le format reste courant chez
 * les départements. Seul le `.shp` est lu : le réseau de fond ne garde que la
 * géométrie (`scripts/preparer-pdipr.mjs`), les attributs du `.dbf` ne
 * serviraient à rien.
 *
 * Ne sert qu'à la préparation, jamais dans le navigateur.
 */
const CODE_FICHIER = 9994
const POLYLIGNE = 3
const NULLE = 0

export function lignesDuShapefile(octets: ArrayBuffer): [number, number][][] {
  const v = new DataView(octets)
  if (v.byteLength < 100 || v.getInt32(0, false) !== CODE_FICHIER) {
    throw new Error('ce fichier n’est pas un shapefile')
  }
  const type = v.getInt32(32, true)
  if (type !== POLYLIGNE) {
    throw new Error(`shapefile de type ${String(type)} : seules les polylignes (3) sont lues`)
  }
  const lignes: [number, number][][] = []
  let o = 100
  while (o + 8 <= v.byteLength) {
    // La longueur est en mots de 16 bits, en-tête de 8 octets non compris.
    const longueur = v.getInt32(o + 4, false) * 2
    const c = o + 8
    o = c + longueur
    if (v.getInt32(c, true) === NULLE) continue
    const nbParties = v.getInt32(c + 36, true)
    const nbPoints = v.getInt32(c + 40, true)
    const premierPoint = c + 44 + 4 * nbParties
    for (let p = 0; p < nbParties; p++) {
      const debut = v.getInt32(c + 44 + 4 * p, true)
      const fin = p + 1 < nbParties ? v.getInt32(c + 48 + 4 * p, true) : nbPoints
      const ligne: [number, number][] = []
      for (let i = debut; i < fin; i++) {
        const q = premierPoint + 16 * i
        ligne.push([v.getFloat64(q, true), v.getFloat64(q + 8, true)])
      }
      lignes.push(ligne)
    }
  }
  return lignes
}
