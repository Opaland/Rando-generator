/** Retire les diacritiques (« Crêt » → « Cret ») sans toucher à la casse. */
export function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Minuscules, sans accents : personne ne tape « crêtes » avec l'accent. */
export function pourChercher(texte: string): string {
  return sansAccents(texte).toLowerCase()
}
