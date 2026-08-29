import { formatKm } from './format.ts'
import { NETWORK_COLORS } from './networkDisplay.ts'
import { ENCRE, GRIS_VERT, PAPIER } from './couleursPartagees.ts'
import { attributionTexte, creditsDesSources } from './attribution.ts'
import type { Summary } from '../core/summary.ts'

/** Format des cartes d'aperçu des réseaux sociaux (1,91:1). */
const CARD_WIDTH = 1_200
const CARD_HEIGHT = 630

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
/**
 * Exporté pour que `tests/unit/carteDePartage.test.ts` puisse relever ce que
 * l'image **écrit** — l'affirmation est vraie au moment où elle est faite, et
 * le test la rend vérifiable plutôt que déclarative (§4bis).
 *
 * `summaryCardBlob` exige un vrai `<canvas>` ; passer par elle obligeait à
 * truquer `document`, ce qui mesurait la sonde autant que le code.
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
  /*
    Seul OSM : l'image de partage ne montre aucun fond de carte, et les
    boucles de la Métropole n'entrent pas dans le bilan qu'elle dessine.
    C'est une composition, pas une recopie — le nom de la licence ne
    s'écrit plus ici (issue #386).
  */
  /*
    Ce que l'image montre, et rien d'autre (issue #388).

    Elle écrivait « Itinéraires © les contributeurs OpenStreetMap (ODbL) »
    en dur, quel que soit son contenu. Or `buildSummary` ne filtre sur aucun
    réseau : une boucle communale de la Métropole de Lyon, versée sous
    Licence Ouverte 2.0, y figure par son nom — mesuré — et n'était créditée
    à personne.

    Créditée **selon ce qui est affiché** et non toujours : écrire « Boucles
    locales © Métropole de Lyon » sur une image qui ne montre que des GR
    vosgiens serait une attribution fausse, c'est-à-dire le défaut qu'on
    corrige, retourné. C'est le même raisonnement que `Relief` plutôt que
    `Fond` sur la feuille imprimée (#386).

    Et **rien** quand il n'y a rien à créditer — un bilan sans itinéraire,
    ou fait de tracés réellement dessinés à la main. Ce n'est pas un crédit
    perdu : `gpxAttributionFor` répond déjà `null` dans ce cas, et une image
    qui créditerait OpenStreetMap là où l'export GPX ne crédite personne
    serait la prochaine paire de listes en désaccord.

    Ce qui garde cette ligne d'être vide par accident n'est donc pas ici,
    mais dans `tests/unit/summary.test.ts` : c'est lui qui asserte que les
    provenances remontent bien des itinéraires.
  */
  const credits = creditsDesSources(summary.sources)
  if (credits.length > 0) {
    ctx.fillText(attributionTexte(...credits), 64, CARD_HEIGHT - 28)
  }
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
