import { test, expect, type Page } from '@playwright/test'
import {
  afficherTousLesReseaux,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ouvrirLaFicheDuGr7,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Où se pose « Ma position » quand la fiche est ouverte au téléphone.
 *
 * #609 (29/10) : la formule recopiée du panneau de tracé posait le bouton
 * 120 px au-dessus de la fiche ; corrigée, elle le posait juste au-dessus du
 * crédit, dans le coin droit — celui du zoom.
 *
 * #584 (décision de Cédric du 03/11) : ce coin ne tient pas tout. Mesuré à
 * 320 × 480 : la bande de carte au-dessus de la fiche fait 180 px, et le
 * bouton (130-174 px) couvrait le bas du « − » (114-158) sur 28 px. Fiche
 * ouverte, il passe donc dans le coin bas gauche, vide à ce moment-là — le
 * rappel du guide ne s'affiche que sans itinéraire, donc jamais fiche
 * ouverte.
 *
 * Ce qui se mesure : le bouton à 12 px au-dessus de la fiche, dans la moitié
 * gauche, peint par lui-même ; le crédit, resté à droite, à 10 px de la
 * fiche (#577) ; et le « − », peint par lui-même (§1bis).
 */
async function mesures(page: Page): Promise<Record<string, number | string> | null> {
  return page.evaluate(() => {
    const fiche = document.querySelector('[data-testid="itinerary-detail"]')
    const bouton = document.querySelector('[data-testid="locate-toggle"]')
    const credit = document.querySelector('.maplibregl-ctrl-bottom-right')
    const moins = document.querySelector('.maplibregl-ctrl-zoom-out')
    if (!fiche || !bouton || !credit || !moins) return null
    const peint = (e: Element) => {
      const r = e.getBoundingClientRect()
      const p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      const temoin =
        p?.closest('[data-testid]')?.getAttribute('data-testid') ??
        p?.className.toString() ??
        'rien'
      return p !== null && e.contains(p) ? 'ok' : `sous ${temoin}`
    }
    const b = bouton.getBoundingClientRect()
    const haut = fiche.getBoundingClientRect().top
    return {
      boutonSurFiche: Math.round(haut - b.bottom),
      boutonAGauche: b.right <= innerWidth / 2 ? 'oui' : `non (${String(Math.round(b.left))} px)`,
      creditSurFiche: Math.round(haut - credit.getBoundingClientRect().bottom),
      boutonPeint: peint(bouton),
      moinsPeint: peint(moins),
    }
  })
}

for (const vue of [
  { largeur: 390, hauteur: 844 },
  { largeur: 360, hauteur: 640 },
  { largeur: 320, hauteur: 480 },
]) {
  test.describe(`fiche ouverte au doigt — ${String(vue.largeur)} × ${String(vue.hauteur)}`, () => {
    test.use({
      viewport: { width: vue.largeur, height: vue.hauteur },
      hasTouch: true,
      isMobile: true,
    })

    test('« Ma position » passe à gauche, juste au-dessus de la fiche, et le zoom reste entier', async ({
      page,
    }) => {
      await mockExternalNetwork(page)
      await mockElevation(page)
      await page.goto('/')
      await fermerLeGuide(page)
      await ouvrirOnglet(page, 'carte')
      await page.getByTestId('zone-pilat').click()
      await page.getByTestId('zone-meta').waitFor({ state: 'attached' })
      await afficherTousLesReseaux(page)
      await ouvrirLaFicheDuGr7(page, true)

      // La fiche s'anime : une mesure prise pendant la transition ne dit
      // rien de l'état final (§1bis).
      await expect.poll(() => mesures(page), { timeout: 10_000 }).toEqual({
        boutonSurFiche: 12,
        boutonAGauche: 'oui',
        creditSurFiche: 10,
        boutonPeint: 'ok',
        moinsPeint: 'ok',
      })
    })
  })
}
