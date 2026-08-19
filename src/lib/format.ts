const kmFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const pctFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** « 12,3 km » à partir de mètres. */
export function formatKm(meters: number): string {
  return `${kmFormat.format(meters / 1000)} km`
}

/** « 34,5 % » à partir d'un pourcentage 0–100. */
export function formatPct(pct: number): string {
  return `${pctFormat.format(pct)} %`
}
