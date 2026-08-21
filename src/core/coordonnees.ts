/**
 * Bornes du référentiel WGS84 — le seul système dans lequel Sentiers sait
 * travailler.
 *
 * Les lecteurs de trace vérifiaient que les coordonnées étaient des nombres
 * finis, et rien d'autre : un GPX déclarant `lat="95" lon="200"` passait
 * intact, faussant en silence les distances, le pourcentage de couverture et
 * le cadrage de la carte (issue #167). Un point aberrant suffit à envoyer la
 * vue à l'autre bout du monde.
 */

/**
 * La coordonnée tombe-t-elle sur Terre ?
 *
 * Les bornes sont inclusives : le pôle et l'antiméridien sont des positions
 * valides, et les exclure écarterait des traces réelles pour rien.
 */
export function estDansLeMonde(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

/**
 * Le message qui accompagne un import ayant écarté des points.
 *
 * Écarter en silence reproduirait le défaut sous une autre forme : une trace
 * amputée sans que rien ne le dise. Retourne null quand il n'y a rien à
 * signaler, pour que l'appelant n'ait pas à connaître la règle.
 */
export function messagePointsHorsLimites(nombre: number): string | null {
  if (nombre <= 0) return null
  return nombre === 1
    ? '1 point hors limites a été ignoré.'
    : `${nombre} points hors limites ont été ignorés.`
}
