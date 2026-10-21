import { test, expect, type Page } from '@playwright/test'
import { afficherTousLesReseaux, mockElevation, mockExternalNetwork } from './helpers.ts'

/**
 * Issues #553, #555 et #556 — le crédit de la carte recouvert.
 *
 * Mesuré par la revue du 19/10, fiche du GR 7 ouverte : 42 % du crédit
 * recouvert par la fiche à 1 280, 54 % à 1 024, 100 % à 800 et 390. Les
 * liens « Métropole de Lyon », « Province Nord », « Département de
 * l'Isère » peints par la fiche : la carte s'affichait sans crédit ODbL ni
 * Licence Ouverte lisible. Et au doigt, le ⓘ était peint par « Démarrer » :
 * le toucher lançait un enregistrement GPS.
 *
 * Tranché par Cédric le 20/10 : le crédit **au-dessus de tout** — des
 * surimpressions de la carte, pas de la feuille, qui est un plan à part.
 *
 * Ce qui est peint, point par point sur le rectangle du crédit (§1bis), et
 * non sa simple présence.
 */
async function partNonPeinte(page: Page): Promise<number> {
  return page.evaluate(() => {
    const credit = document.querySelector('.maplibregl-ctrl-attrib')
    if (!credit) return 1
    const r = credit.getBoundingClientRect()
    let caches = 0
    let total = 0
    for (let i = 1; i < 10; i++) {
      for (let j = 1; j < 4; j++) {
        const x = r.x + (r.width * i) / 10
        const y = r.y + (r.height * j) / 4
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
        total += 1
        const peint = document.elementFromPoint(x, y)
        if (!peint || !credit.contains(peint)) caches += 1
      }
    }
    return total === 0 ? 1 : caches / total
  })
}

for (const largeur of [1024, 1280]) {
  test.describe(`${String(largeur)} px`, () => {
    test.use({ viewport: { width: largeur, height: 768 } })

    test('la fiche ouverte ne recouvre pas le crédit de la carte', async ({ page }) => {
      await mockExternalNetwork(page)
      await mockElevation(page)
      await page.goto('/')
      await page.getByTestId('zone-pilat').click()
      await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
        timeout: 15_000,
      })
      await afficherTousLesReseaux(page)
      await page
        .getByTestId('itinerary-list')
        .getByRole('button', { name: /GR 7/ })
        .first()
        .click()
      await page.getByTestId('itinerary-card-detail-link').click()
      await expect(page.getByTestId('itinerary-detail')).toBeVisible()
      // La fiche existe bien là où le crédit est : sans recouvrement
      // possible, le test ne départagerait rien.
      await expect.poll(() => partNonPeinte(page)).toBe(0)
    })
  })
}
