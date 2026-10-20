/**
 * Ce qu'un fichier ne dit pas ne devient pas une valeur (#567).
 *
 * `Number('')` et `Number(null)` valent 0 : une balise `<ele></ele>` donnait
 * une altitude de 0 m, un `<hdop></hdop>` une précision parfaite, un point
 * sans attribut `lat` se posait sur l'équateur. Et `new Date('pas une date')`
 * s'affichait « Invalid Date ». Les lecteurs GPX et TCX, l'historique et la
 * liste des traces passent par ici plutôt que de refaire la vérification à
 * leur façon (§4ter) : elle était écrite quatre fois, et deux fois oubliée.
 */

/** Le nombre écrit dans un texte, ou `null` s'il est vide, absent ou illisible. */
export function nombreLu(texte: string | null | undefined): number | null {
  if (texte == null || texte.trim() === '') return null
  const nombre = Number(texte)
  return Number.isFinite(nombre) ? nombre : null
}

/**
 * L'instant d'une date, ou `null` si elle est illisible.
 *
 * Prend `unknown` et non `string` : une sauvegarde modifiée à la main peut
 * porter `date: 12345`, que `core/backup.ts` ne revalide pas, et qui
 * s'affichait « 01/01/1970 ».
 */
export function instantDe(date: unknown): number | null {
  if (typeof date !== 'string' || date.trim() === '') return null
  const instant = Date.parse(date)
  return Number.isFinite(instant) ? instant : null
}

/** « 15/06/2026 », ou `null` plutôt que « Invalid Date ». */
export function dateAffichee(date: unknown): string | null {
  const instant = instantDe(date)
  return instant === null ? null : new Date(instant).toLocaleDateString('fr-FR')
}
