import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockTilesOk, buildGpx } from './helpers.ts'

/**
 * Cibles tactiles sur téléphone (docs/AUDIT_MOBILE.md, constat M0).
 *
 * Le critère WCAG 2.2 AA « Target Size (Minimum) » (2.5.8) fixe le plancher
 * à 24 × 24 px. Le test le fige : sans lui, la régression ne serait pas
 * détectée mais re-découverte, comme celle-ci l'a été — six mois après.
 *
 * Le critère prévoit une exception pour les liens en ligne dans une phrase :
 * l'attribution MapLibre en relève, on ne peut pas la grossir sans casser la
 * ligne, et elle n'a pas à l'être.
 */
const MINIMUM = 24

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

test('aucune cible tactile sous 24 px sur un écran de téléphone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('54,5 %')
  // Tout déplier : les filtres et le bilan de sortie comptent aussi.
  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('track-toggle-sortie.gpx').click()

  const trop_petites = await page.evaluate((minimum) => {
    const cibles = [
      ...document.querySelectorAll(
        'button, select, summary, input, [role="button"]',
      ),
    ]
    return cibles
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          descriptif:
            el.getAttribute('data-testid') ||
            `${el.tagName.toLowerCase()}: ${el.textContent.trim().slice(0, 30)}`,
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })
      .filter(
        (e) => e.w > 0 && e.h > 0 && (e.w < minimum || e.h < minimum),
      )
  }, MINIMUM)

  expect(trop_petites).toEqual([])
})
