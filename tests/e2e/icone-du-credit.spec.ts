import { test, expect } from '@playwright/test'
import { fermerLeGuide, mockExternalNetwork, mockTilesOk } from './helpers.ts'

/**
 * Issue #555, point 2 — quatre ⓘ au lieu d'un.
 *
 * Au doigt, le plancher tactile porte tout `button` à 44 px de haut, le
 * bouton « (i) » du crédit compris. Son icône est une image de fond de
 * 24 px, laissée en `background-repeat: repeat` par MapLibre : agrandi, le
 * bouton la répétait en 2 × 2. Visible sur toutes les captures tactiles, à
 * 390, 800 et 1 024 ; à 1 280 à la souris, un seul ⓘ, puisque le plancher
 * vit sous `@media (pointer: coarse)` (CLAUDE.md §1bis : la sonde se
 * configure comme la vraie).
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

test('le bouton du crédit ne montre qu’une icône, centrée', async ({ page }) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')
  await fermerLeGuide(page)
  const bouton = page.locator('.maplibregl-ctrl-attrib-button').first()
  await expect(bouton).toHaveCount(1)
  const style = await bouton.evaluate((e) => {
    const s = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return {
      repetition: s.backgroundRepeat,
      position: s.backgroundPosition,
      hauteur: r.height,
    }
  })
  // Le plancher est bien appliqué : sans lui, il n'y aurait rien à répéter
  // et ce test ne départagerait rien.
  expect(style.hauteur).toBeGreaterThanOrEqual(44)
  expect(style.repetition).toBe('no-repeat')
  expect(style.position).toBe('50% 50%')
})
