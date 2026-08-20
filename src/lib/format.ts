import type { Itinerary } from '../core/types.ts'

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

const moFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/**
 * « 842 o », « 250 ko », « 3,5 Mo » — volume reçu pendant un téléchargement.
 *
 * Pas de décimale avant le mégaoctet : au kilo-octet près, elle défile trop
 * vite pour être lue et ne dit rien de plus.
 */
export function formatOctets(octets: number): string {
  const sain = Number.isFinite(octets) && octets > 0 ? octets : 0
  if (sain < 1024) return `${Math.round(sain)} o`
  if (sain < 1024 * 1024) return `${Math.floor(sain / 1024)} ko`
  return `${moFormat.format(sain / (1024 * 1024))} Mo`
}

/**
 * « il y a 12 jours », « il y a 7 ans » — ancienneté lisible à partir d'un
 * nombre de jours. Les mois sont sautés au-delà de deux ans : à cette échelle
 * ils ne disent plus rien.
 */
export function formatAnciennete(jours: number): string {
  const sain = Math.max(0, Math.round(jours))
  if (sain === 0) return 'aujourd’hui'
  if (sain === 1) return 'hier'
  if (sain < 60) return `il y a ${sain} jours`
  const mois = Math.round(sain / 30)
  if (sain < 730) return `il y a ${mois} mois`
  return `il y a ${Math.round(sain / 365)} ans`
}

/** « 2 h 30 », « 45 min » — durée lisible à partir de minutes. */
export function formatDuration(minutes: number): string {
  const arrondi = Math.max(0, Math.round(minutes))
  if (arrondi < 60) return `${arrondi} min`
  const heures = Math.floor(arrondi / 60)
  const reste = arrondi % 60
  return reste === 0
    ? `${heures} h`
    : `${heures} h ${reste.toString().padStart(2, '0')}`
}

/** « Lecture de sortie.gpx (2 sur 5)… » — avancement d'un import multi-fichiers. */
export function importProgressLabel(progress: {
  done: number
  total: number
  filename: string
}): string {
  const rang = Math.min(progress.done + 1, Math.max(progress.total, 1))
  return progress.total > 1
    ? `Lecture de ${progress.filename} (${rang} sur ${progress.total})…`
    : `Lecture de ${progress.filename}…`
}

/** Nom affiché d'un itinéraire : ref OSM, sinon nom, sinon id. */
export function displayName(itin: Itinerary): string {
  return itin.ref ?? itin.name ?? `Itinéraire ${itin.osmRelationId}`
}
