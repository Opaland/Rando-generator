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

/**
 * Le message qui accompagne une trace trop espacée pour être située
 * (issue #148).
 *
 * Il nomme le chiffre plutôt que de rester vague : « un point tous les
 * 1,4 km » se vérifie et se comprend, là où « trace peu précise » laisse
 * l'utilisateur devant la même énigme qu'un 0 % muet.
 *
 * Il dit « ces portions ne seront pas comptées » et non « le pourcentage
 * restera à 0 % ». La seconde formule était la mienne, et elle est fausse :
 * l'avertissement se déclenche sur la médiane des écarts, donc une trace
 * dont la moitié des points est dense le déclenche aussi. Mesuré sur un
 * itinéraire de 9,4 km — trace entièrement espacée de 1,6 km : 0 % ; deux
 * cents points denses suivis de deux cent dix espacés : 34 %. Ce sont bien
 * les portions espacées qui ne comptent pour rien, pas la trace entière.
 */
export function messageTropEspacee(metres: number): string {
  const km = (metres / 1000).toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })
  return `cette trace n’enregistre qu’un point tous les ${km} km — trop espacé pour situer un passage : ces portions ne seront pas comptées comme parcourues.`
}
