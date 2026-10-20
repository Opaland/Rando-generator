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

/*
  Le jour et le mois d'une sortie, en heure **locale** (#565).

  Choix de présentation, tranché au jugement (§2) le 20/10 : l'histogramme,
  la carte de bilan et le `max` de « Déclarer parcouru » comptaient en UTC,
  le libellé, la liste et l'historique en heure locale. Une sortie du
  31 décembre à 23 h 30 UTC était « le 1 janvier 2026 » dans la liste et
  « déc. 2025 » dans l'histogramme ; à Nouméa, on ne pouvait pas déclarer
  « aujourd'hui » avant 11 h. L'heure locale l'emporte : une sortie faite le
  1ᵉʳ septembre à 7 h à Nouméa a été faite le 1ᵉʳ septembre. Écarté : l'UTC
  partout, qui aurait mis cette sortie en août sur tous les écrans.
*/

/** « AAAA-MM-JJ » du jour **local** d'un instant. */
export function jourLocal(instant: number): string {
  const d = new Date(instant)
  return `${String(d.getFullYear())}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`
}

/** « AAAA-MM » du mois **local** d'une date, ou `null` si elle est illisible. */
export function moisLocal(date: unknown): string | null {
  const instant = instantDe(date)
  return instant === null ? null : jourLocal(instant).slice(0, 7)
}

function deuxChiffres(n: number): string {
  return String(n).padStart(2, '0')
}
