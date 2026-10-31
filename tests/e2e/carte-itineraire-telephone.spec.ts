import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  afficherTousLesReseaux,
  estAlEcran,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  ouvrirLaFicheDuGr7,
  ouvrirOnglet,
} from './helpers.ts'

/**
 * Issue #584 — fiche refermée, la carte d'itinéraire faisait 319 à 371 px et
 * couvrait zoom et boussole. Tranché par Cédric le 31/10 : titre, ✕ et « Voir
 * le détail ». Le reste, « Suivre comme objectif » compris, est dans la fiche.
 */
async function carteApresLaFiche(page: Page, gros: boolean): Promise<void> {
  await mockExternalNetwork(page)
  await mockElevation(page)
  await page.goto('/')
  await fermerLeGuide(page)
  if (gros) await activerLeGrosTexte(page, true)
  await ouvrirOnglet(page, 'carte')
  await page.getByTestId('zone-pilat').click()
  await page.getByTestId('zone-meta').waitFor({ state: 'attached' })
  await afficherTousLesReseaux(page)
  await ouvrirLaFicheDuGr7(page, true)
  await page.getByTestId('itinerary-detail-close').click()
  await ouvrirOnglet(page, 'carte')
}

const peint = (page: Page, selecteur: string) =>
  page.evaluate((sel) => {
    const e = document.querySelector(sel)
    if (!e) return false
    const r = e.getBoundingClientRect()
    return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  }, selecteur)

for (const vue of [
  { largeur: 320, hauteur: 480, gros: false },
  { largeur: 320, hauteur: 480, gros: true },
  { largeur: 360, hauteur: 640, gros: true },
]) {
  test.describe(`${String(vue.largeur)} × ${String(vue.hauteur)}${vue.gros ? ', gros texte' : ''}`, () => {
    test.use({
      viewport: { width: vue.largeur, height: vue.hauteur },
      hasTouch: true,
      isMobile: true,
    })

    test('la carte réduite laisse le zoom, la boussole et ses propres commandes', async ({
      page,
    }) => {
      await carteApresLaFiche(page, vue.gros)
      for (const sel of [
        '.maplibregl-ctrl-zoom-in',
        '.maplibregl-ctrl-zoom-out',
        '.maplibregl-ctrl-compass',
        '[data-testid="locate-toggle"]',
        '[data-testid="itinerary-card-close"]',
        '[data-testid="itinerary-card-detail-link"]',
      ]) {
        await expect.poll(() => peint(page, sel), { message: sel }).toBe(true)
      }
      await expect(page.getByTestId('itinerary-card-pct')).toBeHidden()
      await expect(page.getByTestId('itinerary-card-objectif')).toBeHidden()
    })
  })
}

test.describe('au téléphone', () => {
  test.use({
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
  })

  test('un objectif s’ajoute depuis la fiche, la carte n’ayant plus ce bouton', async ({ page }) => {
    await mockExternalNetwork(page)
    await mockElevation(page)
    await page.goto('/')
    await fermerLeGuide(page)
    await ouvrirOnglet(page, 'carte')
    await page.getByTestId('zone-pilat').click()
    await page.getByTestId('zone-meta').waitFor({ state: 'attached' })
    await afficherTousLesReseaux(page)
    await ouvrirLaFicheDuGr7(page, true)

    const bouton = page.getByTestId('itinerary-detail-objectif')
    await bouton.scrollIntoViewIfNeeded()
    await expect.poll(() => estAlEcran(page, 'itinerary-detail-objectif')).toBe(true)
    await bouton.tap()
    await expect(bouton).toHaveAttribute('aria-pressed', 'true')
  })
})
