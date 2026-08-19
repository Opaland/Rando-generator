import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockExternalNetwork, buildGpx } from './helpers.ts'

/**
 * Audit d'accessibilité automatisé (axe-core, règles WCAG 2 A/AA).
 * Le conteneur MapLibre (canvas + contrôles tiers) est exclu : son contenu
 * n'est pas sous notre contrôle direct.
 */
test('aucune violation a11y sérieuse ou critique sur la vue principale', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(30), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toHaveText('56,8 %')

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.maplibregl-map')
    .analyze()

  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
})

test('aucune violation a11y sérieuse ou critique dans la page À propos', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('about-open').click()
  await expect(page.getByTestId('about-dialog')).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('[data-testid="about-dialog"]')
    .analyze()

  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
})
