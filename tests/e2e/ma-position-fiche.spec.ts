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
 * Issue #609 — fiche ouverte au téléphone, « Ma position » se posait à
 * `12px + --hauteur-fiche + poignée + onglets` du bas, alors que la fiche
 * monte jusqu'à `--hauteur-fiche`, poignée et onglets **compris** : la
 * formule venait du panneau de tracé, qui, lui, se pose au-dessus de ces
 * deux bandes. Mesuré à 390 × 844 : 120 px entre la fiche et le bouton,
 * 66 au-dessus du crédit au lieu de 12, dans une bande qui n'en a pas à
 * perdre (#584).
 *
 * Partir du seul haut de la fiche, essayé, posait le bouton sur le ⓘ du
 * crédit (366-410 px contre 378-422) : relevé sur la fiche (#577), le
 * crédit occupe le même coin. Et `--bande-attribution`, qui le suit
 * d'ordinaire, gardait la valeur de la feuille à mi-hauteur : le crédit
 * s'était déplacé sans changer de taille, ce que `ResizeObserver` ne voit
 * pas — le bouton tombait 14 px sur lui.
 *
 * Ce qui se mesure donc : le bouton à 12 px au-dessus du crédit, comme
 * fiche fermée, le crédit à 10 px au-dessus de la fiche, et le bouton peint
 * par lui-même (§1bis).
 */
async function ecarts(
  page: Page,
): Promise<{ boutonSurCredit: number; creditSurFiche: number; boutonPeint: string } | null> {
  return page.evaluate(() => {
    const fiche = document.querySelector('[data-testid="itinerary-detail"]')
    const bouton = document.querySelector('[data-testid="locate-toggle"]')
    const credit = document.querySelector('.maplibregl-ctrl-bottom-right')
    if (!fiche || !bouton || !credit) return null
    const b = bouton.getBoundingClientRect()
    const c = credit.getBoundingClientRect()
    const p = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    const temoin =
      p?.closest('[data-testid]')?.getAttribute('data-testid') ??
      p?.className.toString() ??
      'rien'
    return {
      boutonSurCredit: Math.round(c.top - b.bottom),
      creditSurFiche: Math.round(fiche.getBoundingClientRect().top - c.bottom),
      boutonPeint: p !== null && bouton.contains(p) ? 'ok' : `sous ${temoin}`,
    }
  })
}

for (const vue of [
  { largeur: 390, hauteur: 844 },
  { largeur: 360, hauteur: 640 },
]) {
  test.describe(`fiche ouverte au doigt — ${String(vue.largeur)} × ${String(vue.hauteur)}`, () => {
    test.use({
      viewport: { width: vue.largeur, height: vue.hauteur },
      hasTouch: true,
      isMobile: true,
    })

    test('« Ma position » se pose juste au-dessus du crédit, sans réserve en trop', async ({
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
      await expect.poll(() => ecarts(page), { timeout: 10_000 }).toEqual({
        boutonSurCredit: 12,
        creditSurFiche: 10,
        boutonPeint: 'ok',
      })
    })
  })
}
