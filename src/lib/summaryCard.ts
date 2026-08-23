import { formatKm } from './format.ts'
import { NETWORK_COLORS } from './networkDisplay.ts'
import { ENCRE, GRIS_VERT, PAPIER } from './couleursPartagees.ts'
import type { Summary } from '../core/summary.ts'

/** Format des cartes d'aperçu des réseaux sociaux (1,91:1). */
export const CARD_WIDTH = 1_200
export const CARD_HEIGHT = 630

const FOND = PAPIER
const GRIS = GRIS_VERT

const DISPLAY = "'Avenir Next', 'Futura', 'Trebuchet MS', system-ui, sans-serif"
const SANS = "system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

function pctTexte(pct: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(pct)} %`
}

/** « 2024 » plutôt que « 2024–2024 » : répéter l'année ne dit rien de plus. */
function anneesTexte(period: { from: string; to: string }): string {
  const debut = period.from.slice(0, 4)
  const fin = period.to.slice(0, 4)
  return debut === fin ? debut : `${debut}–${fin}`
}

/**
 * Dessine le bilan. Volontairement sobre, et volontairement pauvre : le
 * bilan ne contient que des totaux et des noms d'itinéraires publics. Aucun
 * point GPS, aucune date de sortie précise, rien qui dise où habite
 * quelqu'un — une image faite pour être partagée ne doit pas trahir ce que
 * l'application promet de garder.
 */
export function drawSummaryCard(
  ctx: CanvasRenderingContext2D,
  summary: Summary,
): void {
  ctx.fillStyle = FOND
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // Bandeau de balisage, en rappel de l'identité de l'application.
  ctx.fillStyle = NETWORK_COLORS.GR
  ctx.fillRect(0, 0, CARD_WIDTH, 14)

  ctx.fillStyle = GRIS
  ctx.font = `600 26px ${SANS}`
  ctx.fillText('SENTIERS', 64, 92)

  ctx.fillStyle = ENCRE
  ctx.font = `700 150px ${DISPLAY}`
  ctx.fillText(pctTexte(summary.pct), 60, 250)

  ctx.fillStyle = GRIS
  ctx.font = `400 30px ${SANS}`
  const portee = summary.zoneLabel
    ? `des itinéraires balisés — ${summary.zoneLabel}`
    : 'des itinéraires balisés chargés'
  ctx.fillText(portee, 64, 300)
  ctx.fillText(
    `${formatKm(summary.doneMeters)} parcourus sur ${formatKm(summary.totalMeters)}`,
    64,
    345,
  )

  const sorties =
    summary.outings > 0
      ? `${summary.outings} sortie${summary.outings > 1 ? 's' : ''}${
          summary.period ? ` · ${anneesTexte(summary.period)}` : ''
        }`
      : 'aucune trace importée'
  ctx.fillText(sorties, 64, 390)

  // Colonne de droite : les itinéraires les plus avancés.
  let y = 150
  ctx.font = `600 28px ${SANS}`
  for (const ligne of summary.top) {
    ctx.fillStyle = ENCRE
    ctx.fillText(ligne.name, 700, y)
    ctx.fillStyle = ligne.completed ? NETWORK_COLORS.GR : GRIS
    ctx.textAlign = 'right'
    ctx.fillText(pctTexte(ligne.pct), CARD_WIDTH - 64, y)
    ctx.textAlign = 'left'
    y += 52
  }

  ctx.fillStyle = GRIS
  ctx.font = `400 24px ${SANS}`
  ctx.fillText(
    'Calculé sur cet appareil — aucune trace n’a quitté le navigateur.',
    64,
    CARD_HEIGHT - 60,
  )
  ctx.fillText(
    'Itinéraires © les contributeurs OpenStreetMap (ODbL)',
    64,
    CARD_HEIGHT - 28,
  )
}

/** Fabrique l'image PNG du bilan, entièrement en mémoire. */
export async function summaryCardBlob(summary: Summary): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawSummaryCard(ctx, summary)
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob)
    }, 'image/png')
  })
}
